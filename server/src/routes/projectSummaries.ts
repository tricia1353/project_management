import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'

export const projectSummaryRoutes: FastifyPluginAsync = async () => {}

export const projectSummariesRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/project-summaries', async request => {
    const query = request.query as { folderId?: string; limit?: string }
    const limit = Math.min(Number(query.limit ?? 20), 100)

    if (query.folderId) {
      return db
        .prepare(`
          SELECT ps.*, scans.folder_id, scans.started_at, scans.files_added, scans.files_modified, scans.files_deleted
          FROM project_summaries ps
          JOIN scans ON scans.id = ps.scan_id
          WHERE scans.folder_id = ?
          ORDER BY ps.generated_at DESC
          LIMIT ?
        `)
        .all(Number(query.folderId), limit)
    }

    return db
      .prepare(`
        SELECT ps.*, scans.folder_id, scans.started_at, scans.files_added, scans.files_modified, scans.files_deleted
        FROM project_summaries ps
        JOIN scans ON scans.id = ps.scan_id
        ORDER BY ps.generated_at DESC
        LIMIT ?
      `)
      .all(limit)
  })

  fastify.get('/scans', async request => {
    const query = request.query as { folderId?: string; limit?: string }
    const limit = Math.min(Number(query.limit ?? 50), 200)
    if (query.folderId) {
      return db.prepare('SELECT * FROM scans WHERE folder_id = ? ORDER BY started_at DESC LIMIT ?').all(Number(query.folderId), limit)
    }
    return db.prepare('SELECT * FROM scans ORDER BY started_at DESC LIMIT ?').all(limit)
  })
}
