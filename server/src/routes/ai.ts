import type { FastifyPluginAsync } from 'fastify'
import { existsSync } from 'fs'
import { join } from 'path'
import db from '../db/client.js'
import { createAIProvider } from '../ai/factory.js'
import { readTextContent } from '../utils/fileReader.js'
import { enrichProjectsWithActivity } from '../services/projectActivity.js'
import type { Project, ProjectFile } from '../types.js'

const CONFIDENCE_THRESHOLD = 60          // 0-100 整数
const MAX_FILE_CONTENT_CHARS = 2500
const MAX_PROJECT_ASSIGNMENTS = 8

interface SuggestAssignmentsBody {
  targetFolderId?: number
  sourceFolderIds?: number[]
}

interface AIFileSuggestion {
  projectId?: number
  project_id?: number
  confidence?: number | string
  reason?: string
}

function parseJsonLike<T>(content: string, fallback: T): T {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : content) as T
  } catch {
    return fallback
  }
}

/** 统一把 AI 给出的置信度归一到 0-100 整数 */
function normalizeConfidence(raw: number | string | undefined): number {
  if (raw === undefined || raw === null) return 0
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  if (!Number.isFinite(n)) return 0
  // 如果是 0-1 小数，乘以 100
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
  return Math.min(100, Math.max(0, pct))
}

async function buildFileContext(file: ProjectFile & { folder_abs: string }) {
  const absolutePath = join(file.folder_abs, file.relative_path)
  let content = ''
  let contentNote = '非文本文件，仅使用文件名和路径判断'

  if (existsSync(absolutePath)) {
    try {
      const result = await readTextContent(absolutePath)
      if (result.content) {
        content = result.content.slice(0, MAX_FILE_CONTENT_CHARS)
        contentNote = result.truncated ? '文本内容已截断' : '文本内容'
      }
    } catch {
      // keep default contentNote
    }
  }

  return {
    id: file.id,
    filename: file.filename,
    relativePath: file.relative_path,
    extension: file.extension || '',
    contentNote,
    content,
  }
}

function getProjectContexts(projects: Project[]) {
  return projects.map(project => {
    const assignments = db.prepare(`
      SELECT fa.dest_filename,
             f.relative_path AS source_relative_path,
             v.ai_content_summary,
             v.ai_change_summary
      FROM file_assignments fa
      JOIN files f ON f.id = fa.source_file_id
      LEFT JOIN versions v ON v.id = (
        SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
      )
      WHERE fa.project_id = ?
      ORDER BY fa.copied_at DESC
      LIMIT ?
    `).all(project.id, MAX_PROJECT_ASSIGNMENTS) as Array<{
      dest_filename: string
      source_relative_path: string
      ai_content_summary: string | null
      ai_change_summary: string | null
    }>

    return {
      id: project.id,
      name: project.name,
      path: project.path,
      existingFiles: assignments.map(item => ({
        filename: item.dest_filename,
        contentSummary: item.ai_content_summary,
        changeSummary: item.ai_change_summary,
      })),
    }
  })
}

export const aiRoutes: FastifyPluginAsync = async fastify => {
  // SSE 流式接口：每分析完一个文件立即推送一条结果
  fastify.post('/ai/suggest-assignments', async (request, reply) => {
    const body = (request.body ?? {}) as SuggestAssignmentsBody

    const provider = createAIProvider()
    if (!provider) {
      reply.code(400).send({ error: '请先在设置页配置并启用 AI' })
      return
    }

    const projectWhere = ['p.status = ?', 'p.completed_at IS NULL']
    const projectParams: unknown[] = ['active']
    if (body.targetFolderId) {
      projectWhere.push('p.folder_id = ?')
      projectParams.push(body.targetFolderId)
    }

    const projects = db.prepare(`
      SELECT p.*
      FROM projects p
      JOIN folders f ON f.id = p.folder_id AND f.folder_type = 'target'
      WHERE ${projectWhere.join(' AND ')}
      ORDER BY p.path ASC
    `).all(...projectParams) as Project[]

    const fileWhere = [
      'fo.folder_type = ?',
      'f.is_deleted = 0',
      `f.processing_status = 'pending'`,
      'NOT EXISTS (SELECT 1 FROM file_assignments fa WHERE fa.source_file_id = f.id)',
    ]
    const fileParams: unknown[] = ['source']
    if (body.sourceFolderIds?.length) {
      fileWhere.push(`f.folder_id IN (${body.sourceFolderIds.map(() => '?').join(',')})`)
      fileParams.push(...body.sourceFolderIds)
    }

    const files = db.prepare(`
      SELECT f.*, fo.absolute_path AS folder_abs
      FROM files f
      JOIN folders fo ON fo.id = f.folder_id
      WHERE ${fileWhere.join(' AND ')}
      ORDER BY f.updated_at DESC, f.id DESC
      LIMIT 50
    `).all(...fileParams) as Array<ProjectFile & { folder_abs: string }>

    // 设置 SSE 响应头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    if (projects.length === 0) {
      sendEvent('done', { total: 0, message: '暂无可用于分类的活跃项目' })
      reply.raw.end()
      return
    }

    if (files.length === 0) {
      sendEvent('done', { total: 0, message: '暂无需要分类的未归档文件' })
      reply.raw.end()
      return
    }

    sendEvent('start', { total: files.length })

    const projectContexts = getProjectContexts(projects)
    const projectMap = new Map(projects.map(p => [p.id, p]))

    // 逐文件分析并流式推送
    for (const file of files) {
      const fileCtx = await buildFileContext(file)

      let raw = ''
      try {
        raw = await provider.chat([
          {
            role: 'system',
            content:
              '你是项目资料归档助手。根据文件内容语义和项目语义进行分类，禁止根据文件扩展名或文档类型分类。必须返回合法 JSON，不输出任何解释。',
          },
          {
            role: 'user',
            content: `为下面这个文件选择最匹配的一个项目。

规则：
1. 只能从 projects 中选择 projectId（使用 id 字段值）。
2. confidence 是整数，范围 0-100，表示你对归属判断的把握程度。
3. 不要因为文件类型相同就归到同一项目，要看内容语义。
4. 返回严格 JSON，格式：
{"projectId": <number>, "confidence": <0-100整数>, "reason": "<一句中文理由>"}

projects:
${JSON.stringify(projectContexts)}

file:
${JSON.stringify(fileCtx)}`,
          },
        ])
      } catch {
        sendEvent('item', {
          file_id: file.id,
          filename: file.filename,
          relative_path: file.relative_path,
          error: 'AI 分析失败',
          confident: false,
        })
        continue
      }

      const parsed = parseJsonLike<AIFileSuggestion>(raw, {})
      const projectId = parsed.projectId ?? parsed.project_id
      const confidence = normalizeConfidence(parsed.confidence)
      const project = projectId ? projectMap.get(projectId) : undefined

      if (!project) {
        sendEvent('item', {
          file_id: file.id,
          filename: file.filename,
          relative_path: file.relative_path,
          error: 'AI 返回了无效的 projectId',
          confident: false,
        })
        continue
      }

      sendEvent('item', {
        file_id: file.id,
        filename: file.filename,
        relative_path: file.relative_path,
        project_id: project.id,
        project_name: project.name,
        project_path: project.path,
        confidence,
        reason: (parsed.reason ?? '').trim() || 'AI 判断该文件内容与项目语义最匹配',
        confident: confidence >= CONFIDENCE_THRESHOLD,
      })
    }

    sendEvent('done', { total: files.length, threshold: CONFIDENCE_THRESHOLD })
    reply.raw.end()
  })

  // 批量分析项目健康度，生成消息通知
  fastify.post('/ai/analyze-health', async request => {
    const provider = createAIProvider()
    if (!provider) throw fastify.httpErrors.badRequest('请先在设置页配置并启用 AI')

    const rawProjects = db.prepare(`
      SELECT p.*
      FROM projects p
      WHERE p.status = 'active' AND p.completed_at IS NULL
      ORDER BY p.path ASC
    `).all() as Project[]

    const enriched = enrichProjectsWithActivity(rawProjects)
    const stalledProjects = enriched.filter(
      p => p.health_status === 'stalled' || p.health_status === 'needs_review'
    )

    if (stalledProjects.length === 0) {
      return { generated: 0, message: '所有项目状态良好，无需推送健康提醒' }
    }

    // 获取今日已分析过的项目 ID，避免重复
    const today = new Date().toISOString().slice(0, 10)
    const alreadyAnalyzedRows = db.prepare(`
      SELECT project_id FROM messages
      WHERE type = 'health_alert'
        AND project_id IS NOT NULL
        AND date(created_at) = ?
    `).all(today) as { project_id: number }[]
    const alreadyAnalyzedIds = new Set(alreadyAnalyzedRows.map(r => r.project_id))

    const toAnalyze = stalledProjects.filter(p => !alreadyAnalyzedIds.has(p.id))
    if (toAnalyze.length === 0) {
      return { generated: 0, message: '今日已分析过所有需要关注的项目' }
    }

    let generated = 0

    for (const project of toAnalyze) {
      // 获取该项目的最近活动摘要
      const recentAssignments = db.prepare(`
        SELECT fa.dest_filename, fa.copied_at,
               v.ai_content_summary, v.ai_change_summary
        FROM file_assignments fa
        JOIN files f ON f.id = fa.source_file_id
        LEFT JOIN versions v ON v.id = (
          SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
        )
        WHERE fa.project_id = ?
        ORDER BY fa.copied_at DESC
        LIMIT 5
      `).all(project.id) as Array<{
        dest_filename: string
        copied_at: string
        ai_content_summary: string | null
        ai_change_summary: string | null
      }>

      const recentEvents = db.prepare(`
        SELECT body, created_at FROM project_events
        WHERE project_id = ? ORDER BY created_at DESC LIMIT 5
      `).all(project.id) as Array<{ body: string | null; created_at: string }>

      const healthLabel = project.health_status === 'stalled' ? '停滞' : '需要关注'
      const daysSinceActivity = project.latest_activity_at
        ? Math.floor((Date.now() - new Date(project.latest_activity_at).getTime()) / 86400000)
        : null

      const prompt = `你是项目管理助手，请对以下项目进行简洁的健康度解读，并给出1-2句具体建议。

项目信息：
- 名称：${project.name}（路径：${project.path}）
- 健康状态：${healthLabel}
- 距上次活动：${daysSinceActivity !== null ? `${daysSinceActivity} 天` : '未知'}

最近归档文件（最多5个）：
${recentAssignments.length ? recentAssignments.map(a =>
  `- ${a.dest_filename}（${a.copied_at}）${a.ai_content_summary ? '：' + a.ai_content_summary : ''}`
).join('\n') : '暂无'}

最近项目动态（最多5条）：
${recentEvents.length ? recentEvents.map(e => `- ${e.created_at}：${e.body}`).join('\n') : '暂无'}

请返回严格 JSON（不要输出任何解释）：
{"title": "一句话标题（20字以内）", "body": "2-3句具体解读和建议"}`

      try {
        const raw = await provider.chat([
          { role: 'system', content: '你是项目管理助手，返回合法 JSON。' },
          { role: 'user', content: prompt },
        ])
        const parsed = parseJsonLike<{ title?: string; body?: string }>(raw, {})
        const title = (parsed.title ?? '').trim() || `项目「${project.name}」${healthLabel}`
        const body = (parsed.body ?? '').trim() || '项目长时间无活动，请检查进展。'

        db.prepare(`
          INSERT INTO messages (type, title, body, project_id, metadata_json)
          VALUES ('health_alert', ?, ?, ?, ?)
        `).run(title, body, project.id, JSON.stringify({ health_status: project.health_status }))
        generated++
      } catch {
        // 单个项目失败不中断整体
      }
    }

    return { generated, total: toAnalyze.length }
  })
}
