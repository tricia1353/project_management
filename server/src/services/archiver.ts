import { copyFile, mkdir, stat } from 'fs/promises'
import { dirname, extname, join, relative } from 'path'
import db from '../db/client.js'

export interface ArchiveVersionInput {
  folderRoot: string
  fileId: number
  relativePath: string
  absolutePath: string
  checksum: string | null
  eventType: 'created' | 'modified' | 'deleted' | 'restored'
  versionNumber: number
}

/**
 * 将当前文件内容归档，并写入 versions 表。
 * 删除事件可传入不存在的文件路径，此时只写版本记录，不复制文件。
 */
export async function archiveVersion(input: ArchiveVersionInput) {
  let archiveRelativePath: string | null = null
  let sizeBytes = 0

  try {
    const fileStat = await stat(input.absolutePath)
    sizeBytes = fileStat.size

    const ext = extname(input.relativePath)
    const hashPart = input.checksum ? input.checksum.slice(0, 8) : 'deleted'
    const archiveFileName = `${input.versionNumber}_${hashPart}${ext || '.bin'}`
    const archiveDir = join(input.folderRoot, '.kanban-archive', input.relativePath)
    const archiveAbsolutePath = join(archiveDir, archiveFileName)

    await mkdir(dirname(archiveAbsolutePath), { recursive: true })
    await copyFile(input.absolutePath, archiveAbsolutePath)
    archiveRelativePath = relative(input.folderRoot, archiveAbsolutePath)
  } catch {
    // 文件已删除或读取失败时仍保留版本事件记录
  }

  const result = db
    .prepare(`
      INSERT INTO versions (
        file_id, version_number, checksum, archive_path, event_type, size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.fileId,
      input.versionNumber,
      input.checksum,
      archiveRelativePath,
      input.eventType,
      sizeBytes,
    )

  return db.prepare('SELECT * FROM versions WHERE id = ?').get(result.lastInsertRowid)
}
