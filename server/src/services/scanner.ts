import { readdir, stat } from 'fs/promises'
import { join, relative, extname, basename } from 'path'
import db from '../db/client.js'
import { computeChecksum } from '../utils/checksum.js'
import { archiveVersion } from './archiver.js'
import { EXCLUDED_DIRS, EXCLUDED_FILES } from '../config.js'
import logger from '../utils/logger.js'
import { enqueueAISummary } from './aiSummary.js'
import type { ProjectFile } from '../types.js'

// 防并发：正在扫描的 folderId
const activeScanFolderIds = new Set<number>()

interface WalkEntry {
  absolutePath: string
  relativePath: string
}

async function walkDir(rootPath: string, currentPath: string): Promise<WalkEntry[]> {
  const results: WalkEntry[] = []
  let entries: string[]

  try {
    entries = await readdir(currentPath)
  } catch {
    return results
  }

  for (const name of entries) {
    if (EXCLUDED_FILES.has(name)) continue

    const absPath = join(currentPath, name)
    try {
      const s = await stat(absPath)

      if (s.isDirectory()) {
        if (!EXCLUDED_DIRS.has(name)) {
          const sub = await walkDir(rootPath, absPath)
          results.push(...sub)
        }
      } else if (s.isFile()) {
        results.push({
          absolutePath: absPath,
          relativePath: relative(rootPath, absPath),
        })
      }
    } catch {
      // 单文件访问失败不影响整体扫描
    }
  }

  return results
}

export async function scanFolder(folderId: number) {
  if (activeScanFolderIds.has(folderId)) {
    logger.info({ folderId }, 'Scan already in progress, skipping')
    return null
  }

  activeScanFolderIds.add(folderId)

  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as {
    id: number
    absolute_path: string
  } | undefined

  if (!folder) {
    activeScanFolderIds.delete(folderId)
    throw new Error(`Folder ${folderId} not found`)
  }

  // 写入扫描记录
  const scanResult = db
    .prepare(`INSERT INTO scans (folder_id, status) VALUES (?, 'running')`)
    .run(folderId)
  const scanId = Number(scanResult.lastInsertRowid)

  let filesAdded = 0
  let filesModified = 0
  let filesDeleted = 0
  const changedFileIds: number[] = []

  try {
    const scannedFiles = await walkDir(folder.absolute_path, folder.absolute_path)
    const scannedPathSet = new Set(scannedFiles.map(f => f.relativePath))

    // 查询已有文件记录（包含已删除，避免删除后重新出现时撞唯一索引）
    const allExistingFiles = db
      .prepare('SELECT * FROM files WHERE folder_id = ?')
      .all(folderId) as ProjectFile[]
    const activeExistingFiles = allExistingFiles.filter(file => file.is_deleted === 0)

    const existingByPath = new Map(allExistingFiles.map(f => [f.relative_path, f]))

    // 处理新增和修改
    for (const entry of scannedFiles) {
      const { absolutePath, relativePath } = entry

      let checksum: string | null = null
      try {
        checksum = await computeChecksum(absolutePath)
      } catch {
        continue // 单文件失败跳过
      }

      const existing = existingByPath.get(relativePath)

      if (!existing) {
        // 新增
        const fileResult = db
          .prepare(`
            INSERT INTO files (
              folder_id, relative_path, filename, extension,
              current_checksum, status, is_deleted, version_count, last_event_type
            ) VALUES (?, ?, ?, ?, ?, 'backlog', 0, 1, 'created')
          `)
          .run(
            folderId,
            relativePath,
            basename(relativePath),
            extname(relativePath).toLowerCase(),
            checksum,
          )

        const fileId = Number(fileResult.lastInsertRowid)
        await archiveVersion({
          folderRoot: folder.absolute_path,
          fileId,
          relativePath,
          absolutePath,
          checksum,
          eventType: 'created',
          versionNumber: 1,
        })

        filesAdded++
        changedFileIds.push(fileId)
      } else if (existing.is_deleted) {
        // 删除后文件重新出现，作为 restored 版本记录
        const newVersionNumber = existing.version_count + 1

        await archiveVersion({
          folderRoot: folder.absolute_path,
          fileId: existing.id,
          relativePath,
          absolutePath,
          checksum,
          eventType: 'restored',
          versionNumber: newVersionNumber,
        })

        db.prepare(`
          UPDATE files
          SET current_checksum = ?, is_deleted = 0, version_count = ?, last_event_type = 'restored', updated_at = datetime('now')
          WHERE id = ?
        `).run(checksum, newVersionNumber, existing.id)

        filesAdded++
        changedFileIds.push(existing.id)
      } else if (existing.current_checksum !== checksum) {
        // 修改：归档新版本并更新记录
        const newVersionNumber = existing.version_count + 1

        await archiveVersion({
          folderRoot: folder.absolute_path,
          fileId: existing.id,
          relativePath,
          absolutePath,
          checksum,
          eventType: 'modified',
          versionNumber: newVersionNumber,
        })

        db.prepare(`
          UPDATE files
          SET current_checksum = ?, version_count = ?, last_event_type = 'modified', updated_at = datetime('now')
          WHERE id = ?
        `).run(checksum, newVersionNumber, existing.id)

        filesModified++
        changedFileIds.push(existing.id)
      }
    }

    // 处理删除
    for (const existing of activeExistingFiles) {
      if (!scannedPathSet.has(existing.relative_path)) {
        const deletedVersionNumber = existing.version_count + 1

        db.prepare(`
          UPDATE files
          SET is_deleted = 1, version_count = ?, last_event_type = 'deleted', updated_at = datetime('now')
          WHERE id = ?
        `).run(deletedVersionNumber, existing.id)

        // 记录删除版本事件
        await archiveVersion({
          folderRoot: folder.absolute_path,
          fileId: existing.id,
          relativePath: existing.relative_path,
          absolutePath: join(folder.absolute_path, existing.relative_path),
          checksum: null,
          eventType: 'deleted',
          versionNumber: deletedVersionNumber,
        })

        filesDeleted++
      }
    }

    // 完成扫描记录
    db.prepare(`
      UPDATE scans
      SET status = 'completed', completed_at = datetime('now'),
          files_added = ?, files_modified = ?, files_deleted = ?
      WHERE id = ?
    `).run(filesAdded, filesModified, filesDeleted, scanId)

    logger.info({ folderId, scanId, filesAdded, filesModified, filesDeleted }, 'Scan completed')

    // 异步触发 AI 总结（不阻塞扫描返回）
    if (changedFileIds.length > 0) {
      setImmediate(() => {
        enqueueAISummary({ scanId, folderId, changedFileIds, folderRoot: folder.absolute_path })
      })
    }

    return { scanId, filesAdded, filesModified, filesDeleted }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    db.prepare(`
      UPDATE scans SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?
    `).run(msg, scanId)
    logger.error({ folderId, scanId, err }, 'Scan failed')
    throw err
  } finally {
    activeScanFolderIds.delete(folderId)
  }
}
