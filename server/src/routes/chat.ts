import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'
import { createAIProvider } from '../ai/factory.js'
import type { ChatMessage } from '../ai/types.js'
import type { Project, ProjectFile } from '../types.js'

interface ChatSession {
  id: number
  title: string
  created_at: string
  updated_at: string
  last_message?: string | null
}

interface ChatMessageRow {
  id: number
  session_id: number
  role: 'user' | 'assistant'
  content: string
  citations_json: string | null
  created_at: string
}

interface Citation {
  file_id: number
  filename: string
  relative_path: string
}

function parseJsonLike<T>(content: string, fallback: T): T {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : content) as T
  } catch {
    return fallback
  }
}

function buildProjectFileContext() {
  const projects = db.prepare(`
    SELECT p.*
    FROM projects p
    WHERE p.status = 'active'
    ORDER BY p.path ASC
    LIMIT 200
  `).all() as Project[]

  const files = db.prepare(`
    SELECT f.*, v.ai_content_summary, v.ai_change_summary, v.ai_progress_impact,
           fa.project_id, p.path AS project_path
    FROM files f
    LEFT JOIN versions v ON v.id = (
      SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
    )
    LEFT JOIN file_assignments fa ON fa.source_file_id = f.id
    LEFT JOIN projects p ON p.id = fa.project_id
    WHERE f.is_deleted = 0
    ORDER BY f.updated_at DESC
    LIMIT 300
  `).all() as Array<ProjectFile & {
    ai_content_summary: string | null
    ai_change_summary: string | null
    ai_progress_impact: string | null
    project_id: number | null
    project_path: string | null
  }>

  return {
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      status: p.status,
      kanban_status: p.kanban_status,
    })),
    files: files.map(f => ({
      file_id: f.id,
      filename: f.filename,
      relative_path: f.relative_path,
      project_id: f.project_id,
      project_path: f.project_path,
      summary: f.ai_content_summary,
      change_summary: f.ai_change_summary,
      progress_impact: f.ai_progress_impact,
    })),
  }
}

function normalizeCitations(input: unknown): Citation[] {
  if (!Array.isArray(input)) return []
  return input
    .map(item => {
      const value = item as Partial<Citation>
      if (!value.file_id || !value.filename || !value.relative_path) return null
      return {
        file_id: Number(value.file_id),
        filename: String(value.filename),
        relative_path: String(value.relative_path),
      }
    })
    .filter(Boolean) as Citation[]
}

export const chatRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/chat/sessions', async () => {
    return db.prepare(`
      SELECT s.*,
             (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
      FROM chat_sessions s
      ORDER BY s.updated_at DESC
    `).all() as ChatSession[]
  })

  fastify.post('/chat/sessions', async request => {
    const body = request.body as { title?: string }
    const title = body.title?.trim() || '新对话'
    const result = db.prepare('INSERT INTO chat_sessions (title) VALUES (?)').run(title)
    return db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(result.lastInsertRowid) as ChatSession
  })

  fastify.delete('/chat/sessions/:id', async request => {
    const { id } = request.params as { id: string }
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
    return { ok: true }
  })

  fastify.get('/chat/sessions/:id/messages', async request => {
    const { id } = request.params as { id: string }
    const rows = db.prepare(`
      SELECT * FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(id) as ChatMessageRow[]

    return rows.map(row => ({
      ...row,
      citations: row.citations_json ? parseJsonLike<Citation[]>(row.citations_json, []) : [],
    }))
  })

  fastify.post('/chat/sessions/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { userMessage?: string }
    const userMessage = body.userMessage?.trim()
    if (!userMessage) throw fastify.httpErrors.badRequest('消息不能为空')

    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as ChatSession | undefined
    if (!session) throw fastify.httpErrors.notFound('Chat session not found')

    const provider = createAIProvider()
    if (!provider) throw fastify.httpErrors.badRequest('请先在设置页配置并启用 AI')

    db.prepare(`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (?, 'user', ?)
    `).run(id, userMessage)

    if (session.title === '新对话') {
      db.prepare(`UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(userMessage.slice(0, 24), id)
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const context = buildProjectFileContext()
    const historyRows = db.prepare(`
      SELECT role, content FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `).all(id) as Array<{ role: 'user' | 'assistant'; content: string }>

    const history = historyRows.reverse().map(row => ({
      role: row.role,
      content: row.content,
    })) as ChatMessage[]

    const systemPrompt = `你是项目管理智能助手。你只能根据给定的 projects/files 数据回答。
如果使用了文件信息支撑回答，必须在 citations 中列出对应 file_id。
回答必须是严格 JSON，不要输出 JSON 以外的文本：
{"answer":"回答正文，使用中文 Markdown","citations":[{"file_id":1,"filename":"文件名","relative_path":"相对路径"}]}

projects/files 数据：
${JSON.stringify(context)}`

    try {
      const raw = await provider.chat([
        { role: 'system', content: systemPrompt },
        ...history,
      ])
      const parsed = parseJsonLike<{ answer?: string; citations?: unknown }>(raw, {
        answer: raw,
        citations: [],
      })
      const answer = (parsed.answer ?? raw).trim()
      const citations = normalizeCitations(parsed.citations)

      const chunkSize = 24
      for (let i = 0; i < answer.length; i += chunkSize) {
        sendEvent('delta', { text: answer.slice(i, i + chunkSize) })
      }

      db.prepare(`
        INSERT INTO chat_messages (session_id, role, content, citations_json)
        VALUES (?, 'assistant', ?, ?)
      `).run(id, answer, JSON.stringify(citations))
      db.prepare(`UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`).run(id)

      sendEvent('done', { citations })
    } catch (err) {
      sendEvent('error', { message: err instanceof Error ? err.message : 'AI 回复失败' })
    } finally {
      reply.raw.end()
    }
  })
}
