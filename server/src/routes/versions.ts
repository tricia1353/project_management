import type { FastifyPluginAsync } from 'fastify'
import { copyFile, stat } from 'fs/promises'
import { join } from 'path'
import db from '../db/client.js'
import { computeChecksum } from '../utils/checksum.js'
import { readTextContent, isTextFile } from '../utils/fileReader.js'
import { archiveVersion } from '../services/archiver.js'
import type { FileVersion, ProjectFile } from '../types.js'

export const versionRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/files/:id/versions', async request => {
    const { id } = request.params as { id: string }
    return db
      .prepare('SELECT * FROM versions WHERE file_id = ? ORDER BY version_number DESC')
      .all(id)
  })

  fastify.get('/versions/:id/content', async request => {
    const { id } = request.params as { id: string }
    const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(id) as FileVersion | undefined
    if (!version) throw fastify.httpErrors.notFound('Version not found')
    if (!version.archive_path) return { content: '', isText: false, message: '该版本没有可预览的归档内容' }

    const file = db
      .prepare(`
        SELECT f.*, folders.absolute_path
        FROM files f JOIN folders ON folders.id = f.folder_id
        WHERE f.id = ?
      `)
      .get(version.file_id) as (ProjectFile & { absolute_path: string }) | undefined
    if (!file) throw fastify.httpErrors.notFound('File not found')

    const archiveAbsolutePath = join(file.absolute_path, version.archive_path)
    if (!isTextFile(archiveAbsolutePath)) {
      return { content: '', isText: false, message: '二进制文件不支持内容预览' }
    }

    const { content, truncated } = await readTextContent(archiveAbsolutePath)
    return { content, isText: true, truncated }
  })

  fastify.post('/versions/:id/restore', async request => {
    const { id } = request.params as { id: string }
    const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(id) as FileVersion | undefined
    if (!version || !version.archive_path) throw fastify.httpErrors.notFound('Version archive not found')

    const file = db
      .prepare(`
        SELECT f.*, folders.absolute_path
        FROM files f JOIN folders ON folders.id = f.folder_id
        WHERE f.id = ?
      `)
      .get(version.file_id) as (ProjectFile & { absolute_path: string }) | undefined
    if (!file) throw fastify.httpErrors.notFound('File not found')

    const currentPath = join(file.absolute_path, file.relative_path)
    const archivePath = join(file.absolute_path, version.archive_path)

    let nextVersionNumber = file.version_count

    try {
      await stat(currentPath)
      nextVersionNumber += 1
      await archiveVersion({
        folderRoot: file.absolute_path,
        fileId: file.id,
        relativePath: file.relative_path,
        absolutePath: currentPath,
        checksum: file.current_checksum,
        eventType: 'modified',
        versionNumber: nextVersionNumber,
      })
    } catch {
      // 当前文件不存在时直接恢复归档版本
    }

    await copyFile(archivePath, currentPath)
    const checksum = await computeChecksum(currentPath)
    nextVersionNumber += 1

    await archiveVersion({
      folderRoot: file.absolute_path,
      fileId: file.id,
      relativePath: file.relative_path,
      absolutePath: currentPath,
      checksum,
      eventType: 'restored',
      versionNumber: nextVersionNumber,
    })

    db.prepare(`
      UPDATE files
      SET current_checksum = ?, is_deleted = 0, version_count = ?, last_event_type = 'restored', updated_at = datetime('now')
      WHERE id = ?
    `).run(checksum, nextVersionNumber, file.id)

    return db.prepare('SELECT * FROM files WHERE id = ?').get(file.id)
  })
}
