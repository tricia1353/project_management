import PQueue from 'p-queue'
import { join } from 'path'
import db from '../db/client.js'
import { createAIProvider } from '../ai/factory.js'
import { readTextContent } from '../utils/fileReader.js'
import logger from '../utils/logger.js'
import type { ProjectFile, FileVersion } from '../types.js'

const queue = new PQueue({ concurrency: 2 })

interface AISummaryJob {
  scanId: number
  folderId: number
  changedFileIds: number[]
  folderRoot: string
}

function parseJsonLike<T>(content: string, fallback: T): T {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : content) as T
  } catch {
    return fallback
  }
}

export function enqueueAISummary(job: AISummaryJob) {
  queue.add(() => runAISummary(job)).catch(err => {
    logger.error({ err, scanId: job.scanId }, 'AI summary job failed')
  })
}

async function runAISummary(job: AISummaryJob) {
  const provider = createAIProvider()
  if (!provider) {
    logger.info('AI settings not configured, skipping summaries')
    return
  }

  const fileSummaries: string[] = []

  for (const fileId of job.changedFileIds) {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as ProjectFile | undefined
    if (!file || file.is_deleted) continue

    const latestVersion = db
      .prepare('SELECT * FROM versions WHERE file_id = ? ORDER BY version_number DESC LIMIT 1')
      .get(fileId) as FileVersion | undefined
    if (!latestVersion) continue

    const absolutePath = join(job.folderRoot, file.relative_path)
    let currentContent = ''
    let prevContent = ''

    // 读取当前文件内容
    try {
      currentContent = (await readTextContent(absolutePath)).content
    } catch {
      currentContent = `二进制或不可读取文件。文件名：${file.filename}，扩展名：${file.extension}`
    }

    // 读取上一个版本的归档内容（对比用）
    if (latestVersion.version_number > 1) {
      const prevVersion = db
        .prepare('SELECT * FROM versions WHERE file_id = ? AND version_number = ? LIMIT 1')
        .get(fileId, latestVersion.version_number - 1) as FileVersion | undefined
      if (prevVersion?.archive_path) {
        const prevAbsPath = join(job.folderRoot, prevVersion.archive_path)
        try {
          prevContent = (await readTextContent(prevAbsPath)).content
        } catch {
          prevContent = ''
        }
      }
    }

    const prevSection = prevContent
      ? `\n上一版本内容（部分）：\n${prevContent.slice(0, 2000)}`
      : ''

    const prompt = `请根据以下文件信息，输出严格 JSON，不要输出任何解释文字：\n{\n  "changeSummary": "本次变化说明，1-3句",\n  "contentSummary": "当前内容说明，1-3句",\n  "progressImpact": "对项目进度的影响，1-3句"\n}\n\n文件路径：${file.relative_path}\n事件类型：${file.last_event_type}${prevSection}\n\n当前文件内容（部分）：\n${currentContent.slice(0, 2000)}`

    try {
      const raw = await provider.chat([
        { role: 'system', content: '你是项目文件变更分析助手。请始终返回合法 JSON。' },
        { role: 'user', content: prompt },
      ])

      const parsed = parseJsonLike(raw, {
        changeSummary: raw,
        contentSummary: '暂无内容总结',
        progressImpact: '暂无项目进度影响分析',
      })

      db.prepare(`
        UPDATE versions
        SET ai_change_summary = ?, ai_content_summary = ?, ai_progress_impact = ?
        WHERE id = ?
      `).run(
        parsed.changeSummary,
        parsed.contentSummary,
        parsed.progressImpact,
        latestVersion.id,
      )

      fileSummaries.push(`${file.relative_path}: ${parsed.changeSummary}`)
    } catch (err) {
      logger.error({ err, fileId }, 'File AI summary failed')
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

    db.prepare(`
      INSERT INTO project_summaries (scan_id, summary_text, suggested_next_step, files_changed_count)
      VALUES (?, ?, ?, ?)
    `).run(job.scanId, parsed.projectSummary, parsed.suggestedNextStep, fileSummaries.length)
  } catch (err) {
    logger.error({ err, scanId: job.scanId }, 'Project AI summary failed')
  }
}
