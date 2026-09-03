import PQueue from 'p-queue'
import { join } from 'path'
import db from '../db/client.js'
import { createAIProvider } from '../ai/factory.js'
import { extractFileContent } from '../utils/fileReader.js'
import logger from '../utils/logger.js'
import type { ProjectFile, FileVersion } from '../types.js'

const queue = new PQueue({ concurrency: 2 })
const queuedJobKeys = new Set<string>()

// 每批合并的文件数：把多个文件的变更合并成一次 AI 调用，显著降低请求数
const BATCH_SIZE = 4

// 对"项目记忆"价值低、且易产生噪声/浪费额度的文本扩展名，直接跳过 AI 分析
const LOW_VALUE_EXT = new Set(['.lock', '.map', '.min.js', '.min.css', '.svg'])

interface AISummaryJob {
  scanId: number
  folderId: number
  changedFileIds: number[]
  folderRoot: string
}

interface FileJob {
  file: ProjectFile
  latestVersion: FileVersion
  currentContent: string
  prevContent: string
}

type VersionWithSource = FileVersion & {
  source_relative_path?: string
  source_folder_root?: string
}

function parseJsonLike<T>(content: string, fallback: T): T {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : content) as T
  } catch {
    return fallback
  }
}

function parseJsonArray(content: string): unknown[] | null {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // ignore
  }
  const match = content.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed
    } catch {
      // ignore
    }
  }
  return null
}

/**
 * 启动时的回填扫描：找出所有"已归组、事件为 created、组内有真正上一版，
 * 但 ai_change_summary 仍为空"的历史遗留版本（例如迁移时直接写入 DB、
 * 从未经过 scanner.ts/enqueueAISummary 流程的文件），按文件夹重新加入摘要队列。
 * 只处理"文件当前最新版本"，避免重复处理同一文件的历史版本。
 */
export function requeueStuckGroupedVersions() {
  const rows = db.prepare(`
    WITH grouped_timeline AS (
      SELECT
        f.id AS file_id,
        f.folder_id,
        folders.absolute_path AS folder_root,
        ROW_NUMBER() OVER (
          PARTITION BY f.version_group_id
          ORDER BY v.created_at ASC, v.id ASC
        ) AS series_version_number
      FROM versions v
      JOIN files f ON f.id = v.file_id
      JOIN folders ON folders.id = f.folder_id
      WHERE f.version_group_id IS NOT NULL
        AND v.event_type = 'created'
        AND v.ai_change_summary IS NULL
        AND v.version_number = f.version_count
    )
    SELECT file_id, folder_id, folder_root
    FROM grouped_timeline
    WHERE series_version_number > 1
  `).all() as { file_id: number; folder_id: number; folder_root: string }[]

  if (rows.length === 0) return

  const byFolder = new Map<number, { folderRoot: string; fileIds: number[] }>()
  for (const row of rows) {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(row.file_id) as ProjectFile | undefined
    const latestVersion = db
      .prepare('SELECT * FROM versions WHERE file_id = ? ORDER BY version_number DESC LIMIT 1')
      .get(row.file_id) as FileVersion | undefined
    if (!file || !latestVersion) continue

    // 只回填组内真正有上一版的 created 版本；组内真基线不应被误触发 AI 分析。
    const prevVersion = getPreviousVersionInTimeline(file, latestVersion)
    if (!prevVersion) continue

    const entry = byFolder.get(row.folder_id) ?? { folderRoot: row.folder_root, fileIds: [] }
    entry.fileIds.push(row.file_id)
    byFolder.set(row.folder_id, entry)
  }

  if (byFolder.size === 0) return

  logger.info(
    { folders: byFolder.size, files: [...byFolder.values()].reduce((n, e) => n + e.fileIds.length, 0) },
    'Requeuing stuck grouped versions for AI summary',
  )

  for (const [folderId, entry] of byFolder) {
    const scanResult = db.prepare(`
      INSERT INTO scans (folder_id, status, completed_at, files_modified)
      VALUES (?, 'completed', datetime('now'), ?)
    `).run(folderId, entry.fileIds.length)

    enqueueAISummary({
      scanId: Number(scanResult.lastInsertRowid),
      folderId,
      changedFileIds: entry.fileIds,
      folderRoot: entry.folderRoot,
    })
  }
}

export function enqueueAISummary(job: AISummaryJob) {
  const uniqueFileIds = [...new Set(job.changedFileIds)].sort((a, b) => a - b)
  if (uniqueFileIds.length === 0) return

  const key = `${job.scanId}:${job.folderId}:${uniqueFileIds.join(',')}`
  if (queuedJobKeys.has(key)) return
  queuedJobKeys.add(key)

  queue.add(() => runAISummary({ ...job, changedFileIds: uniqueFileIds }))
    .catch(err => {
      logger.error({ err, scanId: job.scanId }, 'AI summary job failed')
    })
    .finally(() => {
      queuedJobKeys.delete(key)
    })
}

function versionMetadata(version: VersionWithSource | undefined, label: string) {
  if (!version) return `${label}：无`
  return [
    `${label}版本：v${version.version_number}`,
    version.source_relative_path ? `${label}来源：${version.source_relative_path}` : '',
    `${label}事件：${version.event_type}`,
    `${label}大小：${version.size_bytes} bytes`,
    `${label}checksum：${version.checksum ?? '无'}`,
    `${label}时间：${version.created_at}`,
  ].filter(Boolean).join('\n')
}

function diffMetadata(current: VersionWithSource, previous: VersionWithSource | undefined) {
  if (!previous) return '对比信息：无上一版本，仅作为当前版本记录。'
  const sizeDelta = current.size_bytes - previous.size_bytes
  return [
    `对比版本：当前物理 v${current.version_number} vs 上一物理 v${previous.version_number}`,
    current.source_relative_path ? `当前来源：${current.source_relative_path}` : '',
    previous.source_relative_path ? `上一来源：${previous.source_relative_path}` : '',
    `大小变化：${sizeDelta >= 0 ? '+' : ''}${sizeDelta} bytes`,
    `checksum 是否变化：${current.checksum !== previous.checksum ? '是' : '否'}`,
  ].filter(Boolean).join('\n')
}

async function buildVersionInput(version: VersionWithSource, folderRoot: string, fallbackLivePath: string) {
  // 上一版可能来自另一个物理文件/文件夹：优先用它自己的归档路径；没有归档时按它自己的文件夹根 + 相对路径拼 fallback，
  // 而不是误用当前文件的 folderRoot/fallbackLivePath（那样会读到错误的文件）。
  const versionFolderRoot = version.source_folder_root ?? folderRoot
  const versionFallbackPath = version.source_relative_path
    ? join(versionFolderRoot, version.source_relative_path)
    : fallbackLivePath
  const versionPath = version.archive_path ? join(versionFolderRoot, version.archive_path) : versionFallbackPath

  if (version.event_type === 'deleted' && !version.archive_path) {
    return '文件已删除，本版本没有当前归档内容。请结合上一版本和版本元数据分析删除影响。'
  }

  try {
    const extracted = await extractFileContent(versionPath)
    return [
      `提取状态：${extracted.status}`,
      `文件类型：${extracted.kind}`,
      extracted.message ? `说明：${extracted.message}` : '',
      '文件元数据：',
      extracted.metadata,
      '可分析内容：',
      extracted.content || extracted.metadata,
    ].filter(Boolean).join('\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `文件内容读取失败，使用版本元数据分析。错误：${message}`
  }
}

/**
 * 在版本组的逻辑时间线里查找"当前版本的上一条"。若文件属于某个版本组，
 * 上一条可能来自另一个物理文件（不同 file_id、不同文件夹）；否则回退到同一物理文件内
 * version_number - 1 的旧逻辑。
 */
function getPreviousVersionInTimeline(
  file: ProjectFile,
  latestVersion: FileVersion,
): VersionWithSource | undefined {
  if (file.version_group_id) {
    const rows = db.prepare(`
      SELECT
        v.*,
        f.relative_path AS source_relative_path,
        folders.absolute_path AS source_folder_root
      FROM versions v
      JOIN files f ON f.id = v.file_id
      JOIN folders ON folders.id = f.folder_id
      WHERE f.version_group_id = ?
      ORDER BY v.created_at ASC, v.id ASC
    `).all(file.version_group_id) as VersionWithSource[]

    const currentIndex = rows.findIndex(row => row.id === latestVersion.id)
    return currentIndex > 0 ? rows[currentIndex - 1] : undefined
  }

  if (latestVersion.version_number <= 1) return undefined

  return db.prepare(`
    SELECT
      v.*,
      f.relative_path AS source_relative_path,
      folders.absolute_path AS source_folder_root
    FROM versions v
    JOIN files f ON f.id = v.file_id
    JOIN folders ON folders.id = f.folder_id
    WHERE v.file_id = ? AND v.version_number = ?
    LIMIT 1
  `).get(file.id, latestVersion.version_number - 1) as VersionWithSource | undefined
}

/**
 * 收集本轮需要做 AI 总结的文件。只跳过初始创建和低价值构建产物；
 * 对非文本文件改用文档提取或元数据差异输入，不再写“二进制跳过”。
 */
async function buildFileJobs(job: AISummaryJob): Promise<FileJob[]> {
  const jobs: FileJob[] = []

  const writeNote = (versionId: number, note: string) => {
    db.prepare(
      `UPDATE versions SET ai_change_summary = ?, ai_content_summary = ?, ai_progress_impact = ? WHERE id = ?`,
    ).run(note, note, note, versionId)
  }

  for (const fileId of job.changedFileIds) {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as ProjectFile | undefined
    if (!file) continue

    const latestVersion = db
      .prepare('SELECT * FROM versions WHERE file_id = ? ORDER BY version_number DESC LIMIT 1')
      .get(fileId) as FileVersion | undefined
    if (!latestVersion) continue

    // 组感知的"上一版"：可能来自另一个物理文件。只有真正找不到上一版（组内/文件自身的
    // 第一条记录）才代表这是货真价实的基线版本，跳过 AI 分析。
    const prevVersion = getPreviousVersionInTimeline(file, latestVersion)
    if (latestVersion.event_type === 'created' && !prevVersion) continue

    if (LOW_VALUE_EXT.has(file.extension)) {
      writeNote(latestVersion.id, `（${file.extension} 文件，属于低价值构建产物，已记录版本变化但不进入项目分析）`)
      continue
    }

    // 去重缓存：相同 checksum 已生成过总结则直接复用，不再调 AI。
    if (latestVersion.checksum) {
      const cached = db
        .prepare(
          `SELECT ai_change_summary, ai_content_summary, ai_progress_impact
           FROM versions WHERE checksum = ? AND ai_change_summary IS NOT NULL LIMIT 1`,
        )
        .get(latestVersion.checksum) as
        | { ai_change_summary: string; ai_content_summary: string; ai_progress_impact: string }
        | undefined
      if (cached) {
        db.prepare(
          `UPDATE versions SET ai_change_summary = ?, ai_content_summary = ?, ai_progress_impact = ? WHERE id = ?`,
        ).run(cached.ai_change_summary, cached.ai_content_summary, cached.ai_progress_impact, latestVersion.id)
        continue
      }
    }

    const livePath = join(job.folderRoot, file.relative_path)
    const currentVersion: VersionWithSource = {
      ...latestVersion,
      source_relative_path: file.relative_path,
      source_folder_root: job.folderRoot,
    }
    const currentInput = await buildVersionInput(currentVersion, job.folderRoot, livePath)
    const prevInput = prevVersion ? await buildVersionInput(prevVersion, job.folderRoot, livePath) : ''

    const currentContent = [
      versionMetadata(currentVersion, '当前'),
      prevVersion ? versionMetadata(prevVersion, '上一') : '',
      diffMetadata(currentVersion, prevVersion),
      currentInput,
    ].filter(Boolean).join('\n\n')

    const prevContent = prevInput
      ? [versionMetadata(prevVersion, '上一'), prevInput].filter(Boolean).join('\n\n')
      : ''

    if (prevVersion && prevContent.trim() === currentContent.trim()) {
      if (prevVersion.ai_change_summary) {
        db.prepare(
          `UPDATE versions SET ai_change_summary = ?, ai_content_summary = ?, ai_progress_impact = ? WHERE id = ?`,
        ).run(prevVersion.ai_change_summary, prevVersion.ai_content_summary, prevVersion.ai_progress_impact, latestVersion.id)
      } else {
        writeNote(latestVersion.id, '本版本与上一版本的可分析内容一致，仅记录版本元数据变化。')
      }
      continue
    }

    jobs.push({ file, latestVersion, currentContent, prevContent })
  }

  return jobs
}

async function summarizeSingle(
  provider: NonNullable<Awaited<ReturnType<typeof createAIProvider>>>,
  job: FileJob,
  fileSummaries: string[],
) {
  const prevSection = job.prevContent
    ? `\n上一版本分析输入（部分）：\n${job.prevContent.slice(0, 2000)}`
    : ''

  const prompt = `请根据以下文件版本信息，输出严格 JSON，不要输出任何解释文字：\n{\n  "changeSummary": "本次变化说明，1-3句；必须说明修改了哪里或发生了什么版本变化",\n  "contentSummary": "当前版本内容或结构说明，1-3句",\n  "progressImpact": "对项目进度的影响，1-3句"\n}\n\n文件路径：${job.file.relative_path}\n事件类型：${job.latestVersion.event_type}${prevSection}\n\n当前版本分析输入（部分）：\n${job.currentContent.slice(0, 2600)}`

  try {
    const raw = await provider.chat([
      { role: 'system', content: '你是项目文件变更分析助手。请始终返回合法 JSON。即使文件无法提取正文，也要基于元数据差异给出可读结论。' },
      { role: 'user', content: prompt },
    ])

    const parsed = parseJsonLike(raw, {
      changeSummary: raw,
      contentSummary: '暂无内容总结',
      progressImpact: '暂无项目进度影响分析',
    })

    db.prepare(
      `UPDATE versions SET ai_change_summary = ?, ai_content_summary = ?, ai_progress_impact = ? WHERE id = ?`,
    ).run(parsed.changeSummary, parsed.contentSummary, parsed.progressImpact, job.latestVersion.id)

    fileSummaries.push(`${job.file.relative_path}: ${parsed.changeSummary}`)
  } catch (err) {
    logger.error({ err, fileId: job.file.id }, 'File AI summary failed')
  }
}

/**
 * 批量总结：将一批文件合并为一次 AI 调用，要求模型返回与顺序一致的 JSON 数组。
 * 成功返回 true；解析失败或数量不符时返回 false，由调用方回退到逐文件总结。
 */
async function summarizeBatch(
  provider: NonNullable<Awaited<ReturnType<typeof createAIProvider>>>,
  batch: FileJob[],
  fileSummaries: string[],
): Promise<boolean> {
  const list = batch
    .map((j, idx) => {
      const prevSection = j.prevContent ? `\n上一版本分析输入(部分):\n${j.prevContent.slice(0, 1600)}` : ''
      return `${idx + 1}. 路径: ${j.file.relative_path} 事件: ${j.latestVersion.event_type}\n当前版本分析输入(部分):\n${j.currentContent.slice(0, 2200)}${prevSection}`
    })
    .join('\n\n')

  const prompt = `你是项目文件变更分析助手。请分析以下多个文件的版本变化，返回一个 JSON 数组，数组每个元素对应一个文件（顺序与输入编号完全一致），每个元素格式为：
{ "changeSummary": "本次变化说明，1-3句；必须说明修改了哪里或发生了什么版本变化", "contentSummary": "当前版本内容或结构说明，1-3句", "progressImpact": "对项目进度的影响，1-3句" }
只返回 JSON 数组，不要任何解释文字。即使文件无法提取正文，也要基于元数据差异给出可读结论。

文件列表：
${list}`

  try {
    const raw = await provider.chat([
      { role: 'system', content: '你是项目文件变更分析助手。请始终返回合法 JSON 数组。' },
      { role: 'user', content: prompt },
    ])

    const arr = parseJsonArray(raw)
    if (!arr || arr.length !== batch.length) return false

    let allOk = true
    batch.forEach((j, idx) => {
      const item = arr[idx] as Record<string, unknown> | undefined
      if (!item || typeof item.changeSummary !== 'string') {
        allOk = false
        return
      }
      const changeSummary = item.changeSummary as string
      const contentSummary = (item.contentSummary as string) || '暂无内容总结'
      const progressImpact = (item.progressImpact as string) || '暂无项目进度影响分析'

      db.prepare(
        `UPDATE versions SET ai_change_summary = ?, ai_content_summary = ?, ai_progress_impact = ? WHERE id = ?`,
      ).run(changeSummary, contentSummary, progressImpact, j.latestVersion.id)

      fileSummaries.push(`${j.file.relative_path}: ${changeSummary}`)
    })
    return allOk
  } catch {
    return false
  }
}

async function runAISummary(job: AISummaryJob) {
  const provider = createAIProvider()
  if (!provider) {
    logger.info('AI settings not configured, skipping summaries')
    return
  }

  const jobs = await buildFileJobs(job)
  const fileSummaries: string[] = []

  // 分批处理；批量失败时回退为逐文件调用，保证正确性
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE)
    const ok = await summarizeBatch(provider, batch, fileSummaries)
    if (!ok) {
      for (const j of batch) {
        await summarizeSingle(provider, j, fileSummaries)
      }
    }
  }

  if (fileSummaries.length === 0) return

  try {
    const raw = await provider.chat([
      { role: 'system', content: '你是项目管理助手。请始终返回合法 JSON。' },
      {
        role: 'user',
        content: `请根据本轮文件变化生成项目级总结，输出严格 JSON：\n{
  "projectSummary": "项目整体进度总结",
  "suggestedNextStep": "建议下一步"
}\n\n本轮文件变化：\n${fileSummaries.join('\n')}`,
      },
    ])

    const parsed = parseJsonLike(raw, {
      projectSummary: raw,
      suggestedNextStep: '建议继续完善关键文档并拆分后续任务。',
    })

    db.prepare(
      `INSERT INTO project_summaries (scan_id, summary_text, suggested_next_step, files_changed_count)
       VALUES (?, ?, ?, ?)`,
    ).run(job.scanId, parsed.projectSummary, parsed.suggestedNextStep, fileSummaries.length)
  } catch (err) {
    logger.error({ err, scanId: job.scanId }, 'Project AI summary failed')
  }
}
