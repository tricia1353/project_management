import type { FastifyPluginAsync } from 'fastify'
import { copyFile, stat } from 'fs/promises'
import { join } from 'path'
import db from '../db/client.js'
import { computeChecksum } from '../utils/checksum.js'
import { extractFileContent } from '../utils/fileReader.js'
import { archiveVersion } from '../services/archiver.js'
import {
  findVersionGroupCandidates,
  mergeFileIntoGroup,
  splitFileFromGroup,
} from '../services/versionGroups.js'
import type { FileVersion, ProjectFile } from '../types.js'

export const versionRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/files/:id/versions', async request => {
    const { id } = request.params as { id: string }
    const fileId = Number(id)

    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as ProjectFile | undefined
    if (!file) throw fastify.httpErrors.notFound('File not found')

    // 无版本组信息（历史脏数据兜底）时，退回只查当前物理文件自己的版本
    if (!file.version_group_id) {
      return db
        .prepare('SELECT * FROM versions WHERE file_id = ? ORDER BY version_number DESC')
        .all(fileId)
    }

    const rows = db
      .prepare(`
        SELECT v.*, f.id AS source_file_id, f.relative_path AS source_relative_path, f.filename AS source_filename
        FROM versions v
        JOIN files f ON f.id = v.file_id
        WHERE f.version_group_id = ?
        ORDER BY v.created_at ASC, v.id ASC
      `)
      .all(file.version_group_id) as Array<FileVersion & {
      source_file_id: number
      source_relative_path: string
      source_filename: string
    }>

    // series_version_number 按时间顺序编号，表示同一版本组内的逻辑版本序号；
    // 不改写物理 version_number（那是该文件自己的版本序号，含义不同）
    const withSeries = rows.map((row, idx) => ({
      ...row,
      series_version_number: idx + 1,
      is_current_file_version: row.source_file_id === fileId,
    }))

    withSeries.reverse()
    return withSeries
  })

  fastify.get('/files/:id/version-group/candidates', async request => {
    const { id } = request.params as { id: string }
    return findVersionGroupCandidates(Number(id))
  })

  fastify.post('/files/:id/version-group/merge', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { target_file_id?: number }
    if (!body.target_file_id) throw fastify.httpErrors.badRequest('target_file_id is required')

    try {
      mergeFileIntoGroup(Number(id), body.target_file_id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw fastify.httpErrors.badRequest(message)
    }

    return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  })

  fastify.post('/files/:id/version-group/split', async request => {
    const { id } = request.params as { id: string }

    try {
      splitFileFromGroup(Number(id))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw fastify.httpErrors.badRequest(message)
    }

    return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
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
    const extracted = await extractFileContent(archiveAbsolutePath)
    return {
      content: extracted.content || extracted.metadata,
      isText: extracted.isText,
      truncated: extracted.truncated,
      message: extracted.message,
    }
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
