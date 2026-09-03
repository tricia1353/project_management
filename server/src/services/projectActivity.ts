import db from '../db/client.js'
import type { Project, ProjectEvent, ProjectHealthStatus, ProjectStatusSettings } from '../types.js'

const DEFAULT_SETTINGS: ProjectStatusSettings = {
  active_days: 7,
  needs_review_days: 30,
}

interface ActivityRow {
  project_id: number
  at: string
}

function parseCollaborators(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function daysSince(dateText: string | null): number | null {
  if (!dateText) return null
  const time = new Date(dateText.replace(' ', 'T')).getTime()
  if (Number.isNaN(time)) return null
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000))
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a.replace(' ', 'T')).getTime() >= new Date(b.replace(' ', 'T')).getTime() ? a : b
}

export function getProjectStatusSettings(): ProjectStatusSettings {
  const rows = db.prepare(`SELECT key, value FROM app_settings WHERE key IN (?, ?)`).all(
    'project_active_days',
    'project_needs_review_days',
  ) as Array<{ key: string; value: string }>

  const values = new Map(rows.map(row => [row.key, Number(row.value)]))
  return {
    active_days: values.get('project_active_days') || DEFAULT_SETTINGS.active_days,
    needs_review_days: values.get('project_needs_review_days') || DEFAULT_SETTINGS.needs_review_days,
  }
}

export function saveProjectStatusSettings(input: ProjectStatusSettings): ProjectStatusSettings {
  const activeDays = Number(input.active_days)
  const needsReviewDays = Number(input.needs_review_days)
  if (!Number.isInteger(activeDays) || activeDays < 1 || activeDays > 3650) {
    throw new Error('活跃天数必须是 1 到 3650 之间的整数')
  }
  if (!Number.isInteger(needsReviewDays) || needsReviewDays <= activeDays || needsReviewDays > 3650) {
    throw new Error('待确认天数必须大于活跃天数，且不超过 3650')
  }

  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run('project_active_days', String(activeDays))
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run('project_needs_review_days', String(needsReviewDays))
  })
  save()

  return { active_days: activeDays, needs_review_days: needsReviewDays }
}

function getDirectActivityMap(): Map<number, string> {
  const rows = db.prepare(`
    SELECT project_id, MAX(at) AS at
    FROM (
      SELECT fa.project_id AS project_id, fa.copied_at AS at
      FROM file_assignments fa
      UNION ALL
      SELECT fa.project_id AS project_id, v.created_at AS at
      FROM file_assignments fa
      JOIN versions v ON v.file_id = fa.source_file_id
    )
    GROUP BY project_id
  `).all() as ActivityRow[]

  return new Map(rows.map(row => [row.project_id, row.at]))
}

function getLatestUpdates(): Map<number, ProjectEvent> {
  const rows = db.prepare(`
    SELECT pe.*
    FROM project_events pe
    JOIN (
      SELECT project_id, MAX(created_at) AS latest_at
      FROM project_events
      WHERE event_type = 'update'
      GROUP BY project_id
    ) latest ON latest.project_id = pe.project_id AND latest.latest_at = pe.created_at
    WHERE pe.event_type = 'update'
  `).all() as ProjectEvent[]

  return new Map(rows.map(row => [row.project_id, row]))
}

function getHealthFromDate(latestActivityAt: string | null, settings: ProjectStatusSettings): { status: ProjectHealthStatus; reason: string } {
  const days = daysSince(latestActivityAt)
  if (days === null) return { status: 'needs_review', reason: '暂无文件活动' }
  if (days <= settings.active_days) return { status: 'active', reason: days === 0 ? '今天有文件活动' : `${days} 天前有文件活动` }
  if (days > settings.needs_review_days) return { status: 'needs_review', reason: `${days} 天未活动，需要确认` }
  return { status: 'stalled', reason: `${days} 天未活动` }
}

export function enrichProjectsWithActivity(projects: Project[], settings = getProjectStatusSettings()): Project[] {
  const directActivity = getDirectActivityMap()
  const latestUpdates = getLatestUpdates()
  const byPath = new Map(projects.map(project => [project.path, project]))
  const childrenByParent = new Map<string, Project[]>()

  for (const project of projects) {
    const parentPath = project.path.includes('/') ? project.path.split('/').slice(0, -1).join('/') : ''
    if (!childrenByParent.has(parentPath)) childrenByParent.set(parentPath, [])
    childrenByParent.get(parentPath)!.push(project)
  }

  const memo = new Map<number, Project>()
  const compute = (project: Project): Project => {
    const existing = memo.get(project.id)
    if (existing) return existing

    const childProjects = childrenByParent.get(project.path) ?? []
    const computedChildren = childProjects.map(child => compute(child))
    const directLatest = directActivity.get(project.id) ?? null
    let latestActivity = directLatest
    for (const child of computedChildren) {
      latestActivity = maxDate(latestActivity, child.latest_activity_at ?? null)
    }

    let health: { status: ProjectHealthStatus; reason: string }
    if (project.completed_at) {
      health = { status: 'completed', reason: '项目已结束' }
    } else if (computedChildren.some(child => child.health_status === 'active')) {
      health = { status: 'active', reason: '子项目近期活跃' }
    } else {
      health = getHealthFromDate(latestActivity, settings)
    }

    const enriched: Project = {
      ...project,
      collaborators: parseCollaborators(project.collaborators_json),
      direct_latest_activity_at: directLatest,
      latest_activity_at: latestActivity,
      latest_update: latestUpdates.get(project.id) ?? null,
      child_project_count: projects.filter(child => child.folder_id === project.folder_id && child.path.startsWith(`${project.path}/`)).length,
      health_status: health.status,
      health_reason: health.reason,
    }
    memo.set(project.id, enriched)
    byPath.set(project.path, enriched)
    return enriched
  }

  return projects.map(project => compute(project))
}

export function getProjectActivityById(projectId: number): Project | null {
  const project = db.prepare(`
    SELECT p.*, f.absolute_path AS folder_path,
           (SELECT COUNT(*) FROM file_assignments fa WHERE fa.project_id = p.id) AS assignment_count
    FROM projects p
    JOIN folders f ON f.id = p.folder_id
    WHERE p.id = ?
  `).get(projectId) as Project | undefined

  if (!project) return null

  const subtree = db.prepare(`
    SELECT p.*, f.absolute_path AS folder_path,
           (SELECT COUNT(*) FROM file_assignments fa WHERE fa.project_id = p.id) AS assignment_count
    FROM projects p
    JOIN folders f ON f.id = p.folder_id
    WHERE p.folder_id = ? AND (p.id = ? OR p.path LIKE ?)
    ORDER BY p.path ASC
  `).all(project.folder_id, project.id, `${project.path}/%`) as Project[]

  return enrichProjectsWithActivity(subtree).find(item => item.id === projectId) ?? null
}
