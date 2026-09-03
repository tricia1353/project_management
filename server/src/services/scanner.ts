import { readdir, stat } from 'fs/promises'
import { join, relative, extname, basename } from 'path'
import db from '../db/client.js'
import { computeChecksum } from '../utils/checksum.js'
import { archiveVersion } from './archiver.js'
import { EXCLUDED_DIRS, EXCLUDED_FILES } from '../config.js'
import logger from '../utils/logger.js'
import { enqueueAISummary } from './aiSummary.js'
import { resolveVersionGroupForNewFile } from './versionGroups.js'
import type { ProjectFile } from '../types.js'

// 防并发：正在扫描的 folderId
const activeScanFolderIds = new Set<number>()

interface WalkEntry {
  absolutePath: string
  relativePath: string
  mtime: number
  size: number
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
          mtime: Math.floor(s.mtimeMs),
          size: s.size,
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
      const { absolutePath, relativePath, mtime, size } = entry
      const existing = existingByPath.get(relativePath)

      // 快速路径：已存在且未删除，mtime + size 均未变化 → 内容几乎必然未变，跳过哈希计算与 DB 写入
      if (existing && !existing.is_deleted && existing.mtime === mtime && existing.size === size) {
        continue
      }

      let checksum: string | null = null
      try {
        checksum = await computeChecksum(absolutePath)
      } catch {
        continue // 单文件失败跳过
      }

      if (!existing) {
        // 新增：先按 checksum/文件名解析应归属的版本组，让跨文件夹的同一份材料接续历史
        const filename = basename(relativePath)
        const { versionGroupId, versionGroupSource } = resolveVersionGroupForNewFile({
          filename,
          checksum,
        })

        const fileResult = db
          .prepare(`
            INSERT INTO files (
              folder_id, relative_path, filename, extension,
              current_checksum, status, is_deleted, version_count, last_event_type,
              mtime, size, processing_status, last_scan_id, ignored_at,
              version_group_id, version_group_source
            ) VALUES (?, ?, ?, ?, ?, 'backlog', 0, 1, 'created', ?, ?, 'pending', ?, NULL, ?, ?)
          `)
          .run(
            folderId,
            relativePath,
            filename,
            extname(relativePath).toLowerCase(),
            checksum,
            mtime,
            size,
            scanId,
            versionGroupId,
            versionGroupSource,
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
        // 新物理文件也可能已被归入已有版本组（跨文件夹接续同一份材料），需要进入摘要队列，
        // 由 aiSummary.ts 的组感知逻辑判断是否真的是基线版本，不在这里预先过滤。
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
          SET current_checksum = ?, is_deleted = 0, version_count = ?, last_event_type = 'restored',
              mtime = ?, size = ?, processing_status = 'pending', ignored_at = NULL, last_scan_id = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(checksum, newVersionNumber, mtime, size, scanId, existing.id)

        filesAdded++
        changedFileIds.push(existing.id)
      } else if (existing.current_checksum !== checksum) {
        // 修改：归档新版本并更新记录。内容变化后重新进入待处理，因为之前的归档/忽略判断基于旧内容
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
          SET current_checksum = ?, version_count = ?, last_event_type = 'modified',
              mtime = ?, size = ?, processing_status = 'pending', ignored_at = NULL, last_scan_id = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(checksum, newVersionNumber, mtime, size, scanId, existing.id)

        filesModified++
        changedFileIds.push(existing.id)
      } else {
        // mtime/size 变了但内容没变：仅刷新存储的 mtime/size，避免下次重复计算哈希
        db.prepare(`
          UPDATE files SET mtime = ?, size = ?, updated_at = datetime('now') WHERE id = ?
        `).run(mtime, size, existing.id)
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
        changedFileIds.push(existing.id)
      }
    }

    // 兼容 v18 迁移前已存在的待处理文件：这些文件没有批次号，但仍应出现在当前扫描批次中。
    db.prepare(`
      UPDATE files
      SET last_scan_id = ?, updated_at = datetime('now')
      WHERE folder_id = ?
        AND is_deleted = 0
        AND processing_status = 'pending'
        AND last_scan_id IS NULL
    `).run(scanId, folderId)

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
