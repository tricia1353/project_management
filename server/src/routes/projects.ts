import type { FastifyPluginAsync } from 'fastify'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import db from '../db/client.js'
import type { FileAssignment, Folder, Project, ProjectEvent, ProjectFile } from '../types.js'
import { enrichProjectsWithActivity, getProjectActivityById } from '../services/projectActivity.js'

const VALID_PROJECT_KANBAN_STATUSES = new Set(['backlog', 'in-progress', 'review', 'done'])

function validateProjectPath(folderAbsPath: string, rawPath: string): { relativePath: string; absolutePath: string } {
  const trimmed = rawPath.trim()
  if (!trimmed) throw new Error('项目路径不能为空')
  if (trimmed.includes('\\')) throw new Error('项目路径请使用 / 分隔目录')
  if (isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) throw new Error('项目路径必须是目标文件夹下的相对路径')

  const segments = trimmed.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('项目路径不能包含空目录、. 或 ..')
  }

  const relativePath = segments.join('/')
  const absolutePath = resolve(folderAbsPath, relativePath)
  const relFromRoot = relative(resolve(folderAbsPath), absolutePath)
  if (relFromRoot === '..' || relFromRoot.startsWith('../') || isAbsolute(relFromRoot)) {
    throw new Error('项目路径不能超出目标文件夹')
  }

  return { relativePath, absolutePath }
}

function getProjectAbsDir(project: Project & { folder_path: string }): string {
  return validateProjectPath(project.folder_path, project.path).absolutePath
}

/**
 * 在目标目录下解析不重名的文件名。
 * 策略：原名 → {stem}_v1{ext} → _v2 → ... → _v99 → 时间戳兜底
 */
function resolveDestFilename(projectAbsDir: string, filename: string): string {
  const ext = extname(filename)
  const stem = basename(filename, ext)

  if (!existsSync(join(projectAbsDir, filename))) return filename

  for (let i = 1; i <= 99; i++) {
    const candidate = `${stem}_v${i}${ext}`
    if (!existsSync(join(projectAbsDir, candidate))) return candidate
  }

  return `${stem}_${Date.now()}${ext}`
}

export const projectRoutes: FastifyPluginAsync = async fastify => {
  // GET /api/projects?folderId=&status=&includeCompleted=
  fastify.get('/projects', async request => {
    const q = request.query as { folderId?: string; status?: string; includeCompleted?: string }
    const where: string[] = []
    const params: unknown[] = []

    if (q.folderId) {
      where.push('p.folder_id = ?')
      params.push(Number(q.folderId))
    }
    if (q.status) {
      where.push('p.status = ?')
      params.push(q.status)
    }
    if (q.includeCompleted !== 'true') {
      where.push('p.completed_at IS NULL')
    }

    const sql = `
      SELECT p.*, f.absolute_path AS folder_path,
             (SELECT COUNT(*) FROM file_assignments fa WHERE fa.project_id = p.id) AS assignment_count,
             (SELECT COUNT(*) FROM projects child
              WHERE child.folder_id = p.folder_id
                AND child.path LIKE p.path || '/%') AS child_project_count
      FROM projects p
      JOIN folders f ON f.id = p.folder_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.path ASC
    `

    const rows = db.prepare(sql).all(...params) as Project[]
    return enrichProjectsWithActivity(rows)
  })

  // GET /api/projects/:id
  fastify.get('/projects/:id', async request => {
    const { id } = request.params as { id: string }
    const enriched = getProjectActivityById(Number(id))
    if (!enriched) throw fastify.httpErrors.notFound('Project not found')
    return enriched
  })

  // POST /api/projects  { folder_id, path } 或兼容旧格式 { folder_id, name }
  fastify.post('/projects', async request => {
    const body = request.body as { folder_id: number; name?: string; path?: string }
    const rawPath = (body.path ?? body.name ?? '').trim()
    if (!body.folder_id || !rawPath)
      throw fastify.httpErrors.badRequest('folder_id 和 path（或 name）不能为空')

    const folder = db
      .prepare('SELECT * FROM folders WHERE id = ? AND folder_type = ?')
      .get(body.folder_id, 'target') as Folder | undefined
    if (!folder) throw fastify.httpErrors.badRequest('folder_id 不是有效的目标文件夹')

    let relativePath: string
    let absPath: string
    try {
      ;({ relativePath, absolutePath: absPath } = validateProjectPath(folder.absolute_path, rawPath))
    } catch (e: unknown) {
      throw fastify.httpErrors.badRequest((e as Error).message)
    }

    mkdirSync(absPath, { recursive: true })

    const displayName = basename(relativePath)
    const result = db
      .prepare('INSERT INTO projects (folder_id, name, path) VALUES (?, ?, ?)')
      .run(body.folder_id, displayName, relativePath)

    return db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid)
  })

  // PATCH /api/projects/:id  { name?, status?, kanban_status?, owner_name?, collaborators?, next_step? }
  fastify.patch('/projects/:id', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string
      status?: 'active' | 'archived'
      kanban_status?: string
      owner_name?: string | null
      collaborators?: string[]
      next_step?: string | null
    }
    const project = db
      .prepare(`
        SELECT p.*, f.absolute_path AS folder_path
        FROM projects p JOIN folders f ON f.id = p.folder_id
        WHERE p.id = ?
      `)
      .get(id) as (Project & { folder_path: string }) | undefined
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    if (body.name && body.name.trim() !== project.name) {
      const newName = body.name.trim()
      let newRelativePath: string
      let newAbsPath: string
      try {
        const parentPath = dirname(project.path)
        const candidatePath = parentPath === '.' ? newName : `${parentPath}/${newName}`
        ;({ relativePath: newRelativePath, absolutePath: newAbsPath } = validateProjectPath(project.folder_path, candidatePath))
      } catch (e: unknown) {
        throw fastify.httpErrors.badRequest((e as Error).message)
      }

      const oldAbsPath = getProjectAbsDir(project)
      renameSync(oldAbsPath, newAbsPath)
      db.prepare(`UPDATE projects SET name = ?, path = ?, updated_at = datetime('now') WHERE id = ?`).run(newName, newRelativePath, id)
    }

    if (body.status) {
      db.prepare(`UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(body.status, id)
    }

    if (body.kanban_status) {
      if (!VALID_PROJECT_KANBAN_STATUSES.has(body.kanban_status))
        throw fastify.httpErrors.badRequest(`kanban_status 必须是 backlog/in-progress/review/done`)
      db.prepare(`UPDATE projects SET kanban_status = ?, updated_at = datetime('now') WHERE id = ?`).run(body.kanban_status, id)
    }

    if (body.owner_name !== undefined) {
      const ownerName = typeof body.owner_name === 'string' ? body.owner_name.trim() : null
      db.prepare(`UPDATE projects SET owner_name = ?, updated_at = datetime('now') WHERE id = ?`).run(ownerName || null, id)
    }

    if (body.collaborators !== undefined) {
      if (!Array.isArray(body.collaborators)) throw fastify.httpErrors.badRequest('collaborators 必须是字符串数组')
      const collaborators = body.collaborators
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
      db.prepare(`UPDATE projects SET collaborators_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
        collaborators.length ? JSON.stringify(collaborators) : null,
        id
      )
    }

    if (body.next_step !== undefined) {
      const nextStep = typeof body.next_step === 'string' ? body.next_step.trim() : null
      db.prepare(`UPDATE projects SET next_step = ?, updated_at = datetime('now') WHERE id = ?`).run(nextStep || null, id)
    }

    return getProjectActivityById(Number(id))
  })

  // DELETE /api/projects/:id — 仅删库，不删磁盘
  fastify.delete('/projects/:id', async request => {
    const { id } = request.params as { id: string }
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return { ok: true }
  })

  // GET /api/projects/:id/assignments
  fastify.get('/projects/:id/assignments', async request => {
    const { id } = request.params as { id: string }
    return db
      .prepare(`
        SELECT fa.*,
               f.filename AS source_filename, f.relative_path AS source_relative_path,
               src_folder.absolute_path AS source_folder_path
        FROM file_assignments fa
        JOIN files f ON f.id = fa.source_file_id
        JOIN folders src_folder ON src_folder.id = f.folder_id
        WHERE fa.project_id = ?
        ORDER BY fa.copied_at DESC
      `)
      .all(id)
  })

  // POST /api/projects/:id/assign  { fileId }
  fastify.post('/projects/:id/assign', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { fileId: number }
    if (!body.fileId) throw fastify.httpErrors.badRequest('fileId is required')

    const project = db
      .prepare(`
        SELECT p.*, f.absolute_path AS folder_path
        FROM projects p JOIN folders f ON f.id = p.folder_id
        WHERE p.id = ?
      `)
      .get(id) as (Project & { folder_path: string }) | undefined
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const srcFile = db
      .prepare(`
        SELECT f.*, fo.absolute_path AS folder_abs
        FROM files f JOIN folders fo ON fo.id = f.folder_id
        WHERE f.id = ?
      `)
      .get(body.fileId) as (ProjectFile & { folder_abs: string }) | undefined
    if (!srcFile) throw fastify.httpErrors.notFound('Source file not found')

    const srcAbsPath = join(srcFile.folder_abs, srcFile.relative_path)
    if (!existsSync(srcAbsPath)) throw fastify.httpErrors.badRequest('源文件不存在于磁盘')

    const projectAbsDir = getProjectAbsDir(project)
    mkdirSync(projectAbsDir, { recursive: true })

    const destFilename = resolveDestFilename(projectAbsDir, srcFile.filename)
    const destAbsPath = join(projectAbsDir, destFilename)

    copyFileSync(srcAbsPath, destAbsPath)

    const result = db
      .prepare('INSERT INTO file_assignments (source_file_id, project_id, dest_filename) VALUES (?, ?, ?)')
      .run(body.fileId, Number(id), destFilename)

    // 复制成功后标记源文件已归档，避免重复出现在扫描池和智能分类候选中
    db.prepare(`
      UPDATE files SET processing_status = 'archived', ignored_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(body.fileId)

    db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(id)

    return {
      id: result.lastInsertRowid,
      project_id: Number(id),
      source_file_id: body.fileId,
      dest_filename: destFilename,
      dest_path: destAbsPath,
    }
  })

  // POST /api/projects/:id/finalize — 保留最终版，旧版移入 其他/
  fastify.post('/projects/:id/finalize', async request => {
    const { id } = request.params as { id: string }
    const project = db
      .prepare(`
        SELECT p.*, f.absolute_path AS folder_path
        FROM projects p JOIN folders f ON f.id = p.folder_id
        WHERE p.id = ?
      `)
      .get(id) as (Project & { folder_path: string }) | undefined
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const projectAbsDir = getProjectAbsDir(project)
    const otherDir = join(projectAbsDir, '其他')

    let entries: string[] = []
    try {
      entries = readdirSync(projectAbsDir, { withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => e.name)
        .filter(name => name !== '.DS_Store')
    } catch {
      return { moved: [] }
    }

    // 按"基础名"分组：strip _v数字 后缀
    // 例：report.pdf, report_v1.pdf, report_v2.pdf → 同组，基础名 report.pdf
    const groups = new Map<string, Array<{ name: string; version: number }>>()

    for (const name of entries) {
      const ext = extname(name)
      const stem = basename(name, ext)
      const m = stem.match(/^(.+?)_v(\d+)$/)

      let baseKey: string
      let version: number

      if (m) {
        baseKey = m[1] + ext
        version = parseInt(m[2], 10)
      } else {
        baseKey = name
        version = 0
      }

      if (!groups.has(baseKey)) groups.set(baseKey, [])
      groups.get(baseKey)!.push({ name, version })
    }

    const moved: string[] = []

    for (const [, files] of groups) {
      if (files.length <= 1) continue

      files.sort((a, b) => b.version - a.version)
      const [, ...rest] = files

      mkdirSync(otherDir, { recursive: true })
      for (const f of rest) {
        const src = join(projectAbsDir, f.name)
        const dst = join(otherDir, f.name)
        // 如果 其他/ 里已有同名，也自动添加时间戳
        const finalDst = existsSync(dst) ? join(otherDir, `${basename(f.name, extname(f.name))}_${Date.now()}${extname(f.name)}`) : dst
        renameSync(src, finalDst)
        moved.push(f.name)
      }
    }

    db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(id)

    return { moved }
  })

  // POST /api/projects/:id/archive
  fastify.post('/projects/:id/archive', async request => {
    const { id } = request.params as { id: string }
    db.prepare(`UPDATE projects SET status = 'archived', updated_at = datetime('now') WHERE id = ?`).run(id)
    return { ok: true }
  })

  // POST /api/projects/:id/unarchive
  fastify.post('/projects/:id/unarchive', async request => {
    const { id } = request.params as { id: string }
    db.prepare(`UPDATE projects SET status = 'active', updated_at = datetime('now') WHERE id = ?`).run(id)
    return { ok: true }
  })

  // GET /api/projects/:id/events
  fastify.get('/projects/:id/events', async request => {
    const { id } = request.params as { id: string }
    return db.prepare(`
      SELECT * FROM project_events WHERE project_id = ?
      ORDER BY created_at DESC LIMIT 100
    `).all(id) as ProjectEvent[]
  })

  // POST /api/projects/:id/events
  fastify.post('/projects/:id/events', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { body: string }
    if (!body.body?.trim()) throw fastify.httpErrors.badRequest('动态内容不能为空')

    const result = db
      .prepare(`INSERT INTO project_events (project_id, event_type, body) VALUES (?, 'update', ?)`)
      .run(Number(id), body.body.trim())

    return db.prepare('SELECT * FROM project_events WHERE id = ?').get(result.lastInsertRowid)
  })

  // GET /api/projects/:id/export.md — 导出可携带的 Markdown 快照
  fastify.get('/projects/:id/export.md', async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = getProjectActivityById(Number(id))
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const HEALTH_LABELS: Record<string, string> = {
      active: '活跃',
      stalled: '停滞',
      needs_review: '待确认',
      completed: '已结束',
    }

    const files = db
      .prepare(`
        SELECT fa.dest_filename,
               f.relative_path AS source_relative_path,
               f.version_count,
               f.last_event_type,
               latest.ai_content_summary,
               latest.ai_change_summary,
               latest.ai_progress_impact,
               latest.version_number AS latest_version,
               latest.created_at AS latest_version_at
        FROM file_assignments fa
        JOIN files f ON f.id = fa.source_file_id
        LEFT JOIN versions latest ON latest.id = (
          SELECT id FROM versions WHERE file_id = f.id ORDER BY version_number DESC LIMIT 1
        )
        WHERE fa.project_id = ?
        ORDER BY fa.copied_at DESC
      `)
      .all(Number(id)) as Array<{
        dest_filename: string
        source_relative_path: string | null
        version_count: number
        last_event_type: string | null
        ai_content_summary: string | null
        ai_change_summary: string | null
        ai_progress_impact: string | null
        latest_version: number | null
        latest_version_at: string | null
      }>

    const events = db
      .prepare(`SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`)
      .all(Number(id)) as ProjectEvent[]

    const now = new Date().toLocaleString('zh-CN')
    const health = project.health_status ?? 'needs_review'
    const healthLabel = HEALTH_LABELS[health] ?? health
    const name = project.name
    const fullPath = project.folder_path ? `${project.folder_path}/${project.path}` : project.path

    const lines: string[] = []
    lines.push(`# 项目导出：${name}`)
    lines.push('')
    lines.push(`> 由「本地项目记忆体」自动生成 · 导出时间：${now}`)
    lines.push('')
    lines.push(`**路径**：${fullPath}`)
    lines.push(`**健康度**：${healthLabel}${project.health_reason ? `（${project.health_reason}）` : ''}`)
    lines.push(`**最近活动**：${project.latest_activity_at ?? '暂无'}`)
    lines.push(`**归档文件数**：${project.assignment_count ?? files.length}`)
    lines.push(`**创建时间**：${new Date(project.created_at).toLocaleString('zh-CN')}`)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 项目时间线')
    lines.push('')
    if (events.length === 0) {
      lines.push('_暂无动态记录。_')
    } else {
      for (const ev of events) {
        const when = new Date(ev.created_at.replace(' ', 'T')).toLocaleString('zh-CN')
        const body = (ev.body ?? ev.event_type).replace(/\n+/g, ' ')
        lines.push(`- **[${when}]** ${body}`)
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 归档文件与 AI 记忆')
    lines.push('')
    if (files.length === 0) {
      lines.push('_暂无归档文件。_')
    } else {
      for (const f of files) {
        lines.push(`### ${f.dest_filename}`)
        if (f.source_relative_path) lines.push(`- 来源：${f.source_relative_path}`)
        const v = f.latest_version ?? f.version_count
        const evType = f.last_event_type ?? 'created'
        const vAt = f.latest_version_at ? new Date(f.latest_version_at.replace(' ', 'T')).toLocaleString('zh-CN') : ''
        lines.push(`- 版本：v${v}（${evType}${vAt ? `，${vAt}` : ''}）`)
        lines.push(`- **AI 内容总结**：${f.ai_content_summary || '暂无'}`)
        lines.push(`- **AI 变更总结**：${f.ai_change_summary || '暂无'}`)
        lines.push(`- **进度影响**：${f.ai_progress_impact || '暂无'}`)
        lines.push('')
      }
    }
    lines.push('---')
    lines.push('')
    lines.push('_本文件由本地项目看板自动生成，包含项目元信息、时间线与各文件的最新 AI 三维度总结，可自由分享。所有数据均来自你本机，未上传任何云端。_')

    const markdown = lines.join('\n')
    return reply
      .type('text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="project-${encodeURIComponent(name)}.md"`)
      .send(markdown)
  })

  // POST /api/projects/:id/complete
  fastify.post('/projects/:id/complete', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { scope: 'current' | 'with_children' }
    if (!['current', 'with_children'].includes(body.scope))
      throw fastify.httpErrors.badRequest('scope 必须是 current 或 with_children')

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const affected: number[] = [project.id]
    if (body.scope === 'with_children') {
      const children = db.prepare(
        `SELECT id FROM projects WHERE folder_id = ? AND path LIKE ?`
      ).all(project.folder_id, `${project.path}/%`) as { id: number }[]
      affected.push(...children.map(c => c.id))
    }

    const now = `datetime('now')`
    const complete = db.transaction(() => {
      for (const pid of affected) {
        db.prepare(`UPDATE projects SET completed_at = datetime('now'), completed_scope = ?, updated_at = datetime('now') WHERE id = ?`).run(body.scope, pid)
        db.prepare(`INSERT INTO project_events (project_id, event_type, body, metadata_json) VALUES (?, 'completed', ?, ?)`).run(
          pid,
          body.scope === 'with_children' && pid !== project.id ? '子项目已结束' : '项目已结束',
          JSON.stringify({ scope: body.scope, root_id: project.id })
        )
      }
    })
    complete()

    return { ok: true, affected_count: affected.length }
  })

  // POST /api/projects/:id/restore
  fastify.post('/projects/:id/restore', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { scope?: 'current' | 'with_children' }
    const scope = body.scope ?? 'current'

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
    if (!project) throw fastify.httpErrors.notFound('Project not found')

    const affected: number[] = [project.id]
    if (scope === 'with_children') {
      const children = db.prepare(
        `SELECT id FROM projects WHERE folder_id = ? AND path LIKE ?`
      ).all(project.folder_id, `${project.path}/%`) as { id: number }[]
      affected.push(...children.map(c => c.id))
    }

    const restore = db.transaction(() => {
      for (const pid of affected) {
        db.prepare(`UPDATE projects SET completed_at = NULL, completed_scope = NULL, updated_at = datetime('now') WHERE id = ?`).run(pid)
        db.prepare(`INSERT INTO project_events (project_id, event_type, body, metadata_json) VALUES (?, 'restored', '项目已恢复', ?)`).run(
          pid,
          JSON.stringify({ scope, root_id: project.id })
        )
      }
    })
    restore()

    return { ok: true, affected_count: affected.length }
  })
}

// 仅用于报告路由内部查询，不对外导出
export function getProjectAssignmentStats(
  startDate: string,
  endDate: string,
): Array<{ name: string; files_added_count: number }> {
  return db.prepare(`
    SELECT p.name, COUNT(fa.id) AS files_added_count
    FROM file_assignments fa
    JOIN projects p ON fa.project_id = p.id
    WHERE fa.copied_at >= ? AND fa.copied_at <= ?
    GROUP BY p.id
    ORDER BY files_added_count DESC
  `).all(startDate, endDate + ' 23:59:59') as Array<{ name: string; files_added_count: number }>
}
