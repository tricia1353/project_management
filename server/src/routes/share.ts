import type { FastifyPluginAsync } from 'fastify'
import { randomBytes } from 'crypto'
import db from '../db/client.js'
import type { Project, ProjectEvent } from '../types.js'
import { getProjectActivityById } from '../services/projectActivity.js'

interface ProjectShareRow {
  id: number
  project_id: number
  token: string
  enabled: number
  expires_at: string | null
  created_at: string
  updated_at: string
}

interface PublicShareFileRow {
  assignment_id: number
  dest_filename: string
  source_relative_path: string | null
  extension: string | null
  copied_at: string
  summary: string | null
  change_summary: string | null
  progress_impact: string | null
}

function createToken(): string {
  return randomBytes(32).toString('base64url')
}

function getShareByProject(projectId: number): ProjectShareRow | undefined {
  return db.prepare('SELECT * FROM project_shares WHERE project_id = ?').get(projectId) as ProjectShareRow | undefined
}

function getActiveShareByToken(token: string): ProjectShareRow | undefined {
  return db
    .prepare(`
      SELECT *
      FROM project_shares
      WHERE token = ?
        AND enabled = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `)
    .get(token) as ProjectShareRow | undefined
}

function ensureProjectExists(projectId: number): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project | undefined
}

function validateAssignmentIds(projectId: number, assignmentIds: number[]): number[] {
  const uniqueIds = [...new Set(assignmentIds.map(Number).filter(Number.isInteger))]
  if (uniqueIds.length === 0) return []

  const placeholders = uniqueIds.map(() => '?').join(',')
  const rows = db
    .prepare(`
      SELECT id
      FROM file_assignments
      WHERE project_id = ? AND id IN (${placeholders})
    `)
    .all(projectId, ...uniqueIds) as Array<{ id: number }>

  if (rows.length !== uniqueIds.length) {
    throw new Error('存在不属于当前项目的文件')
  }

  return uniqueIds
}

function getSelectedAssignmentIds(shareId: number): number[] {
  const rows = db
    .prepare('SELECT assignment_id FROM project_share_files WHERE share_id = ? ORDER BY assignment_id ASC')
    .all(shareId) as Array<{ assignment_id: number }>
  return rows.map(row => row.assignment_id)
}

function getPublicFiles(shareId: number): PublicShareFileRow[] {
  return db
    .prepare(`
      SELECT psf.assignment_id,
             fa.dest_filename,
             f.relative_path AS source_relative_path,
             f.extension,
             fa.copied_at,
             latest.ai_content_summary AS summary,
             latest.ai_change_summary AS change_summary,
             latest.ai_progress_impact AS progress_impact
      FROM project_share_files psf
      JOIN file_assignments fa ON fa.id = psf.assignment_id
      JOIN files f ON f.id = fa.source_file_id
      LEFT JOIN versions latest ON latest.id = (
        SELECT id
        FROM versions
        WHERE file_id = f.id
        ORDER BY version_number DESC
        LIMIT 1
      )
      WHERE psf.share_id = ?
      ORDER BY fa.copied_at DESC
    `)
    .all(shareId) as PublicShareFileRow[]
}

export const shareRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/projects/:id/share', async request => {
    const { id } = request.params as { id: string }
    const projectId = Number(id)
    const project = ensureProjectExists(projectId)
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const share = getShareByProject(projectId)
    if (!share) {
      return {
        enabled: false,
        token: null,
        selected_assignment_ids: [],
        created_at: null,
        updated_at: null,
      }
    }

    return {
      id: share.id,
      project_id: share.project_id,
      token: share.token,
      enabled: share.enabled === 1,
      selected_assignment_ids: getSelectedAssignmentIds(share.id),
      created_at: share.created_at,
      updated_at: share.updated_at,
      expires_at: share.expires_at,
    }
  })

  fastify.put('/projects/:id/share', async request => {
    const { id } = request.params as { id: string }
    const projectId = Number(id)
    const body = request.body as { enabled?: boolean; assignmentIds?: number[] }
    const project = ensureProjectExists(projectId)
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    let assignmentIds: number[]
    try {
      assignmentIds = validateAssignmentIds(projectId, Array.isArray(body.assignmentIds) ? body.assignmentIds : [])
    } catch (err) {
      throw fastify.httpErrors.badRequest((err as Error).message)
    }

    const upsert = db.transaction(() => {
      let share = getShareByProject(projectId)
      if (!share) {
        const result = db
          .prepare('INSERT INTO project_shares (project_id, token, enabled) VALUES (?, ?, ?)')
          .run(projectId, createToken(), body.enabled === false ? 0 : 1)
        share = db.prepare('SELECT * FROM project_shares WHERE id = ?').get(result.lastInsertRowid) as ProjectShareRow
      } else {
        db.prepare('UPDATE project_shares SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
          body.enabled === false ? 0 : 1,
          share.id,
        )
      }

      db.prepare('DELETE FROM project_share_files WHERE share_id = ?').run(share.id)
      const insertFile = db.prepare('INSERT INTO project_share_files (share_id, assignment_id) VALUES (?, ?)')
      for (const assignmentId of assignmentIds) {
        insertFile.run(share.id, assignmentId)
      }

      return db.prepare('SELECT * FROM project_shares WHERE id = ?').get(share.id) as ProjectShareRow
    })

    const share = upsert()
    return {
      id: share.id,
      project_id: share.project_id,
      token: share.token,
      enabled: share.enabled === 1,
      selected_assignment_ids: getSelectedAssignmentIds(share.id),
      created_at: share.created_at,
      updated_at: share.updated_at,
      expires_at: share.expires_at,
    }
  })

  fastify.post('/projects/:id/share/reset-token', async request => {
    const { id } = request.params as { id: string }
    const projectId = Number(id)
    const project = ensureProjectExists(projectId)
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const share = getShareByProject(projectId)
    if (!share) throw fastify.httpErrors.notFound('Share not found')

    db.prepare('UPDATE project_shares SET token = ?, updated_at = datetime(\'now\') WHERE id = ?').run(createToken(), share.id)
    const updated = db.prepare('SELECT * FROM project_shares WHERE id = ?').get(share.id) as ProjectShareRow

    return {
      id: updated.id,
      project_id: updated.project_id,
      token: updated.token,
      enabled: updated.enabled === 1,
      selected_assignment_ids: getSelectedAssignmentIds(updated.id),
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      expires_at: updated.expires_at,
    }
  })

  fastify.get('/share/:token', async request => {
    const { token } = request.params as { token: string }
    const share = getActiveShareByToken(token)
    if (!share) throw fastify.httpErrors.notFound('Share not found')

    const project = getProjectActivityById(share.project_id)
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const events = db
      .prepare(`
        SELECT id, project_id, event_type, body, NULL AS metadata_json, created_at
        FROM project_events
        WHERE project_id = ?
          AND event_type IN ('update', 'completed', 'restored', 'status_changed')
        ORDER BY created_at DESC
        LIMIT 20
      `)
      .all(share.project_id) as ProjectEvent[]

    return {
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        status: project.status,
        kanban_status: project.kanban_status,
        completed_at: project.completed_at,
        health_status: project.health_status,
        health_reason: project.health_reason,
        latest_activity_at: project.latest_activity_at,
        direct_latest_activity_at: project.direct_latest_activity_at,
        assignment_count: project.assignment_count,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
      events,
      files: getPublicFiles(share.id),
      shared_at: share.updated_at,
    }
  })
}
