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
      processingStatus?: 'pending' | 'archived' | 'ignored' | 'all'
      scanId?: string
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
    // 默认只看待处理文件，避免已归档/已忽略的文件再次出现在扫描池
    if (!query.processingStatus || query.processingStatus === 'pending') {
      where.push(`processing_status = 'pending'`)
    } else if (query.processingStatus !== 'all') {
      where.push('processing_status = ?')
      params.push(query.processingStatus)
    }
    if (query.scanId) {
      if (!query.processingStatus || query.processingStatus === 'pending') {
        where.push('(last_scan_id = ? OR last_scan_id IS NULL)')
      } else {
        where.push('last_scan_id = ?')
      }
      params.push(Number(query.scanId))
    }

    const sql = `
      SELECT f.id, f.folder_id, f.relative_path, f.filename, f.extension,
             f.current_checksum, f.status, f.is_deleted, f.version_count,
             f.last_event_type, f.processing_status, f.last_scan_id, f.ignored_at,
             f.manual_suggestion, f.manual_suggestion_updated_at,
             f.created_at, f.updated_at,
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
               f.last_event_type, f.processing_status, f.last_scan_id, f.ignored_at,
               f.manual_suggestion, f.manual_suggestion_updated_at,
               f.created_at, f.updated_at,
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

  fastify.patch('/files/:id/remark', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      manual_suggestion?: string | null
      push_to_messages?: boolean
    }

    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as
      | { id: number; folder_id: number; relative_path: string; filename: string; version_count: number; manual_suggestion?: string | null }
      | undefined
    if (!file) throw fastify.httpErrors.notFound('File not found')

    const manualSuggestion = typeof body.manual_suggestion === 'string' ? body.manual_suggestion.trim() : ''
    db.prepare(`
      UPDATE files
      SET manual_suggestion = ?, manual_suggestion_updated_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(manualSuggestion || null, id)

    // 历史记录：即使是清空（空字符串）也记录一条，保持审计完整
    db.prepare(`
      INSERT INTO file_suggestion_history (file_id, manual_suggestion, pushed_to_messages)
      VALUES (?, ?, ?)
    `).run(file.id, manualSuggestion || null, body.push_to_messages ? 1 : 0)

    if (body.push_to_messages) {
      const title = '修改建议'
      const messageBody = manualSuggestion || '（无备注内容）'
      db.prepare(`
        INSERT INTO messages (type, title, body, project_id, metadata_json)
        VALUES (?, ?, ?, NULL, ?)
      `).run(
        'manual_suggestion',
        title,
        messageBody,
        JSON.stringify({
          file_id: file.id,
          filename: file.filename,
          relative_path: file.relative_path,
          version_count: file.version_count,
        })
      )
    }

    return db.prepare(`
      SELECT f.id, f.folder_id, f.relative_path, f.filename, f.extension,
             f.current_checksum, f.status, f.is_deleted, f.version_count,
             f.last_event_type, f.processing_status, f.last_scan_id, f.ignored_at,
             f.manual_suggestion, f.manual_suggestion_updated_at,
             f.created_at, f.updated_at,
             folders.absolute_path,
             v.ai_change_summary, v.ai_content_summary, v.ai_progress_impact
      FROM files f
      JOIN folders ON folders.id = f.folder_id
      LEFT JOIN versions v ON v.id = (
        SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
      )
      WHERE f.id = ?
    `).get(id)
  })

  // GET /files/:id/suggestion-history — 按版本组聚合返回修改建议历史（无分组信息时回退为只查当前文件）
  fastify.get('/files/:id/suggestion-history', async request => {
    const { id } = request.params as { id: string }
    const fileId = Number(id)

    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as
      | { id: number; version_group_id: number | null }
      | undefined
    if (!file) throw fastify.httpErrors.notFound('File not found')

    if (!file.version_group_id) {
      return db.prepare(`
        SELECT h.*, f.filename AS source_filename, f.relative_path AS source_relative_path
        FROM file_suggestion_history h
        JOIN files f ON f.id = h.file_id
        WHERE h.file_id = ?
        ORDER BY h.created_at DESC, h.id DESC
      `).all(fileId)
    }

    return db.prepare(`
      SELECT h.*, f.filename AS source_filename, f.relative_path AS source_relative_path
      FROM file_suggestion_history h
      JOIN files f ON f.id = h.file_id
      WHERE f.version_group_id = ?
      ORDER BY h.created_at DESC, h.id DESC
    `).all(file.version_group_id)
  })

  // POST /files/:id/ignore — 标记为“不需要加入现有项目”，从默认池和 AI 候选中隐藏
  fastify.post('/files/:id/ignore', async request => {
    const { id } = request.params as { id: string }

    const result = db.prepare(`
      UPDATE files
      SET processing_status = 'ignored', ignored_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND is_deleted = 0
    `).run(id)

    if (result.changes === 0) throw fastify.httpErrors.notFound('File not found')
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  })

  // POST /files/:id/restore — 从忽略状态恢复为待处理，重新回到当前扫描批次
  fastify.post('/files/:id/restore', async request => {
    const { id } = request.params as { id: string }

    const result = db.prepare(`
      UPDATE files
      SET processing_status = 'pending',
          ignored_at = NULL,
          updated_at = datetime('now'),
          last_scan_id = (
            SELECT s.id FROM scans s WHERE s.folder_id = files.folder_id
            ORDER BY s.started_at DESC, s.id DESC LIMIT 1
          )
      WHERE id = ? AND is_deleted = 0
    `).run(id)

    if (result.changes === 0) throw fastify.httpErrors.notFound('File not found')
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  })

  // GET /files/scans?folderId=<id> — 扫描批次历史，附带每批次仍待处理数量
  fastify.get('/scans', async request => {
    const query = request.query as { folderId?: string; limit?: string }
    if (!query.folderId) throw fastify.httpErrors.badRequest('folderId is required')

    const limit = query.limit ? Number(query.limit) : 20

    return db.prepare(`
      SELECT
        s.id, s.folder_id, s.started_at, s.completed_at,
        s.files_added, s.files_modified, s.files_deleted,
        s.status, s.error_message,
        (
          SELECT COUNT(*) FROM files f
          WHERE f.last_scan_id = s.id AND f.processing_status = 'pending' AND f.is_deleted = 0
        ) AS pending_count
      FROM scans s
      WHERE s.folder_id = ?
      ORDER BY s.started_at DESC, s.id DESC
      LIMIT ?
    `).all(Number(query.folderId), limit)
  })
}
