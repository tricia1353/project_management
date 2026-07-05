import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'
import type { Project } from '../types.js'

interface AppMessage {
  id: number
  type: string
  title: string
  body: string
  project_id: number | null
  metadata_json: string | null
  status: string
  remind_at: string | null
  created_at: string
  updated_at: string
}

export const messageRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/messages', async request => {
    const q = request.query as { status?: string }
    const statusFilter = q.status ?? 'active'

    let whereClause: string
    if (statusFilter === 'all') {
      whereClause = "WHERE m.status != 'dismissed'"
    } else if (statusFilter === 'unread') {
      whereClause = "WHERE m.status = 'unread'"
    } else {
      // 'active' = unread + reminders that are due
      whereClause = `WHERE (
        m.status = 'unread'
        OR (m.status = 'read' AND m.remind_at IS NOT NULL AND m.remind_at <= datetime('now'))
      )`
    }

    return db.prepare(`
      SELECT m.*, p.name AS project_name, p.path AS project_path, p.health_status
      FROM messages m
      LEFT JOIN (
        SELECT id, name, path, status,
               completed_at
        FROM projects
      ) p ON p.id = m.project_id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all() as (AppMessage & { project_name?: string; project_path?: string })[]
  })

  fastify.get('/messages/unread-count', async () => {
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt FROM messages
      WHERE status = 'unread'
         OR (status = 'read' AND remind_at IS NOT NULL AND remind_at <= datetime('now'))
    `).get() as { cnt: number }
    return { count: row.cnt }
  })

  fastify.post('/messages/:id/read', async request => {
    const { id } = request.params as { id: string }
    db.prepare(`UPDATE messages SET status = 'read', updated_at = datetime('now') WHERE id = ?`).run(id)
    return { ok: true }
  })

  fastify.post('/messages/:id/dismiss', async request => {
    const { id } = request.params as { id: string }
    db.prepare(`UPDATE messages SET status = 'dismissed', updated_at = datetime('now') WHERE id = ?`).run(id)
    return { ok: true }
  })

  fastify.post('/messages/:id/archive-project', async request => {
    const { id } = request.params as { id: string }
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as AppMessage | undefined
    if (!msg) throw fastify.httpErrors.notFound('Message not found')
    if (!msg.project_id) throw fastify.httpErrors.badRequest('此消息没有关联项目')

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(msg.project_id) as Project | undefined
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    db.transaction(() => {
      db.prepare(`UPDATE projects SET status = 'archived', updated_at = datetime('now') WHERE id = ?`).run(msg.project_id)
      db.prepare(`UPDATE messages SET status = 'dismissed', updated_at = datetime('now') WHERE id = ?`).run(id)
    })()

    return { ok: true }
  })

  fastify.post('/messages/:id/add-event', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { body?: string }
    const eventBody = body.body?.trim()
    if (!eventBody) throw fastify.httpErrors.badRequest('动态内容不能为空')

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as AppMessage | undefined
    if (!msg) throw fastify.httpErrors.notFound('Message not found')
    if (!msg.project_id) throw fastify.httpErrors.badRequest('此消息没有关联项目')

    db.transaction(() => {
      db.prepare(`
        INSERT INTO project_events (project_id, event_type, body)
        VALUES (?, 'update', ?)
      `).run(msg.project_id, eventBody)
      db.prepare(`
        UPDATE projects SET updated_at = datetime('now') WHERE id = ?
      `).run(msg.project_id)
      db.prepare(`
        UPDATE messages SET status = 'read', updated_at = datetime('now') WHERE id = ?
      `).run(id)
    })()

    return { ok: true }
  })

  fastify.post('/messages/:id/remind', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { remindAt?: string }
    const remindAt = body.remindAt?.trim()
    if (!remindAt) throw fastify.httpErrors.badRequest('remindAt 不能为空')

    const date = new Date(remindAt)
    if (Number.isNaN(date.getTime())) throw fastify.httpErrors.badRequest('remindAt 格式无效')
    if (date <= new Date()) throw fastify.httpErrors.badRequest('提醒时间必须在未来')

    db.prepare(`
      UPDATE messages
      SET status = 'read', remind_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(remindAt, id)

    return { ok: true }
  })
}
