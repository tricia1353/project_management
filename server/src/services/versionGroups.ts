import db from '../db/client.js'
import type { ProjectFile, VersionGroupCandidate } from '../types.js'

export interface ResolvedVersionGroup {
  versionGroupId: number
  versionGroupSource: 'scanner_checksum' | 'scanner_filename'
}

/**
 * 为一个刚扫描到的新文件（folder_id + relative_path 之前不存在）解析应归属的版本组。
 * 优先级：同 checksum 精确匹配 > 同文件名兜底匹配 > 新建版本组。
 * 只在“新增文件”分支调用；已有文件的修改不重新归组，沿用现有 version_group_id。
 */
export function resolveVersionGroupForNewFile(input: {
  filename: string
  checksum: string | null
}): ResolvedVersionGroup {
  if (input.checksum) {
    const byChecksum = db
      .prepare(`
        SELECT version_group_id FROM files
        WHERE current_checksum = ? AND version_group_id IS NOT NULL
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `)
      .get(input.checksum) as { version_group_id: number } | undefined

    if (byChecksum) {
      return { versionGroupId: byChecksum.version_group_id, versionGroupSource: 'scanner_checksum' }
    }
  }

  const byFilename = db
    .prepare(`
      SELECT version_group_id FROM files
      WHERE filename = ? COLLATE NOCASE AND version_group_id IS NOT NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `)
    .get(input.filename) as { version_group_id: number } | undefined

  if (byFilename) {
    return { versionGroupId: byFilename.version_group_id, versionGroupSource: 'scanner_filename' }
  }

  const created = db
    .prepare(`INSERT INTO file_version_groups (canonical_name) VALUES (?)`)
    .run(input.filename)

  return { versionGroupId: Number(created.lastInsertRowid), versionGroupSource: 'scanner_checksum' }
}

/**
 * 查找可能属于同一份材料、但当前不在同一版本组的候选文件（同文件名或同 checksum）。
 */
export function findVersionGroupCandidates(fileId: number): VersionGroupCandidate[] {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as ProjectFile | undefined
  if (!file) return []

  const candidates = new Map<number, VersionGroupCandidate>()

  if (file.current_checksum) {
    const byChecksum = db
      .prepare(`
        SELECT id, filename, relative_path, folder_id, version_group_id
        FROM files
        WHERE current_checksum = ? AND id != ? AND (version_group_id IS NULL OR version_group_id != ?)
      `)
      .all(file.current_checksum, fileId, file.version_group_id ?? -1) as Array<{
      id: number
      filename: string
      relative_path: string
      folder_id: number
      version_group_id: number | null
    }>

    for (const row of byChecksum) {
      candidates.set(row.id, {
        file_id: row.id,
        filename: row.filename,
        relative_path: row.relative_path,
        folder_id: row.folder_id,
        version_group_id: row.version_group_id,
        reason: 'checksum_match',
      })
    }
  }

  const byFilename = db
    .prepare(`
      SELECT id, filename, relative_path, folder_id, version_group_id
      FROM files
      WHERE filename = ? COLLATE NOCASE AND id != ? AND (version_group_id IS NULL OR version_group_id != ?)
    `)
    .all(file.filename, fileId, file.version_group_id ?? -1) as Array<{
    id: number
    filename: string
    relative_path: string
    folder_id: number
    version_group_id: number | null
  }>

  for (const row of byFilename) {
    if (!candidates.has(row.id)) {
      candidates.set(row.id, {
        file_id: row.id,
        filename: row.filename,
        relative_path: row.relative_path,
        folder_id: row.folder_id,
        version_group_id: row.version_group_id,
        reason: 'filename_match',
      })
    }
  }

  return Array.from(candidates.values())
}

/**
 * 把 fileId 归并到 targetFileId 所在的版本组（人工合并）。
 */
export function mergeFileIntoGroup(fileId: number, targetFileId: number) {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as ProjectFile | undefined
  const target = db.prepare('SELECT * FROM files WHERE id = ?').get(targetFileId) as ProjectFile | undefined
  if (!file) throw new Error('File not found')
  if (!target) throw new Error('Target file not found')

  let targetGroupId = target.version_group_id ?? null
  if (!targetGroupId) {
    const created = db
      .prepare(`INSERT INTO file_version_groups (canonical_name) VALUES (?)`)
      .run(target.filename)
    targetGroupId = Number(created.lastInsertRowid)
    db.prepare(`UPDATE files SET version_group_id = ?, version_group_source = 'manual' WHERE id = ?`)
      .run(targetGroupId, targetFileId)
  }

  const fromGroupId = file.version_group_id ?? null
  db.prepare(`
    UPDATE files SET version_group_id = ?, version_group_source = 'manual', updated_at = datetime('now')
    WHERE id = ?
  `).run(targetGroupId, fileId)

  db.prepare(`
    INSERT INTO file_version_group_events (file_id, from_group_id, to_group_id, event_type, reason)
    VALUES (?, ?, ?, 'manual_merge', ?)
  `).run(fileId, fromGroupId, targetGroupId, `手动合并到文件 #${targetFileId}（${target.filename}）所在历史线`)

  return targetGroupId
}

/**
 * 把 fileId 从当前版本组拆出，独立成一个新版本组（人工拆分）。
 */
export function splitFileFromGroup(fileId: number) {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as ProjectFile | undefined
  if (!file) throw new Error('File not found')

  const fromGroupId = file.version_group_id ?? null

  const created = db
    .prepare(`INSERT INTO file_version_groups (canonical_name) VALUES (?)`)
    .run(file.filename)
  const newGroupId = Number(created.lastInsertRowid)

  db.prepare(`
    UPDATE files SET version_group_id = ?, version_group_source = 'manual', updated_at = datetime('now')
    WHERE id = ?
  `).run(newGroupId, fileId)

  db.prepare(`
    INSERT INTO file_version_group_events (file_id, from_group_id, to_group_id, event_type, reason)
    VALUES (?, ?, ?, 'manual_split', ?)
  `).run(fileId, fromGroupId, newGroupId, '手动从历史线拆出，独立为新历史线')

  return newGroupId
}
