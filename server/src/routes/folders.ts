import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'
import { DEFAULT_SCAN_INTERVAL } from '../config.js'
import { triggerScanForFolder, refreshFolderSchedule } from '../services/scheduler.js'

export const folderRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/folders', async request => {
    const query = request.query as { folder_type?: 'source' | 'target' }
    if (query.folder_type) {
      return db.prepare('SELECT * FROM folders WHERE folder_type = ? ORDER BY created_at DESC').all(query.folder_type)
    }
    return db.prepare('SELECT * FROM folders ORDER BY created_at DESC').all()
  })

  fastify.post('/folders', async request => {
    const body = request.body as {
      absolute_path: string
      scan_interval_seconds?: number
      enabled?: boolean
      folder_type?: 'source' | 'target'
    }

    if (!body.absolute_path) {
      throw fastify.httpErrors.badRequest('absolute_path is required')
    }

    const result = db
      .prepare(`
        INSERT INTO folders (absolute_path, scan_interval_seconds, enabled, folder_type)
        VALUES (?, ?, ?, ?)
      `)
      .run(
        body.absolute_path,
        body.scan_interval_seconds ?? DEFAULT_SCAN_INTERVAL,
        body.enabled === false ? 0 : 1,
        body.folder_type ?? 'source',
      )

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(result.lastInsertRowid)
    refreshFolderSchedule(Number(result.lastInsertRowid))
    return folder
  })

  fastify.patch('/folders/:id', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      absolute_path?: string
      scan_interval_seconds?: number
      enabled?: boolean
      folder_type?: 'source' | 'target'
    }

    const existing = db.prepare('SELECT * FROM folders WHERE id = ?').get(id)
    if (!existing) throw fastify.httpErrors.notFound('Folder not found')

    db.prepare(`
      UPDATE folders
      SET absolute_path = COALESCE(?, absolute_path),
          scan_interval_seconds = COALESCE(?, scan_interval_seconds),
          enabled = COALESCE(?, enabled),
          folder_type = COALESCE(?, folder_type),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      body.absolute_path ?? null,
      body.scan_interval_seconds ?? null,
      typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : null,
      body.folder_type ?? null,
      id,
    )

    refreshFolderSchedule(Number(id))
    return db.prepare('SELECT * FROM folders WHERE id = ?').get(id)
  })

  fastify.delete('/folders/:id', async request => {
    const { id } = request.params as { id: string }
    db.prepare('DELETE FROM folders WHERE id = ?').run(id)
    refreshFolderSchedule(Number(id))
    return { ok: true }
  })

  fastify.post('/folders/:id/scan', async request => {
    const { id } = request.params as { id: string }
    return triggerScanForFolder(Number(id))
  })
}
