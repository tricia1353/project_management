import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'

const VALID_STATUSES = new Set(['backlog', 'in-progress', 'review', 'done'])

export const fileRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/files', async request => {
    const query = request.query as {
      folderId?: string
      search?: string
      extension?: string
      status?: string
      includeDeleted?: string
    }

    const where: string[] = []
    const params: unknown[] = []

    if (query.folderId) {
      where.push('folder_id = ?')
      params.push(Number(query.folderId))
    }
    if (query.search) {
      where.push('(filename LIKE ? OR relative_path LIKE ?)')
      params.push(`%${query.search}%`, `%${query.search}%`)
    }
    if (query.extension) {
      where.push('extension = ?')
      params.push(query.extension)
    }
    if (query.status) {
      where.push('status = ?')
      params.push(query.status)
    }
    if (query.includeDeleted !== 'true') {
      where.push('is_deleted = 0')
    }

    const sql = `
      SELECT f.id, f.folder_id, f.relative_path, f.filename, f.extension,
             f.current_checksum, f.status, f.is_deleted, f.version_count,
             f.last_event_type, f.created_at, f.updated_at,
             v.ai_change_summary, v.ai_content_summary, v.ai_progress_impact
      FROM files f
      LEFT JOIN versions v ON v.id = (
        SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
      )
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY f.updated_at DESC
    `

    return db.prepare(sql).all(...params)
  })

  fastify.get('/files/:id', async request => {
    const { id } = request.params as { id: string }
    const file = db
      .prepare(`
        SELECT f.id, f.folder_id, f.relative_path, f.filename, f.extension,
               f.current_checksum, f.status, f.is_deleted, f.version_count,
               f.last_event_type, f.created_at, f.updated_at,
               folders.absolute_path,
               v.ai_change_summary, v.ai_content_summary, v.ai_progress_impact
        FROM files f
        JOIN folders ON folders.id = f.folder_id
        LEFT JOIN versions v ON v.id = (
          SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
        )
        WHERE f.id = ?
      `)
      .get(id)
    if (!file) throw fastify.httpErrors.notFound('File not found')
    return file
  })

  fastify.patch('/files/:id/status', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { status: string }

    if (!VALID_STATUSES.has(body.status)) {
      throw fastify.httpErrors.badRequest('Invalid status')
    }

    const result = db.prepare(`
      UPDATE files SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(body.status, id)

    if (result.changes === 0) throw fastify.httpErrors.notFound('File not found')
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  })
}
