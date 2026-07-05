import type { FastifyPluginAsync } from 'fastify'
import { extname, basename } from 'path'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import db from '../db/client.js'

interface ReportTemplate {
  id: number
  name: string
  content: string
  source_type: string        // 'text' | 'docx' | 'xlsx' | 'csv' | 'txt'
  original_filename: string | null
  is_default: number
  created_at: string
  updated_at: string
}

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt'])

async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string> {
  switch (ext) {
    case '.docx':
    case '.doc': {
      const result = await mammoth.extractRawText({ buffer })
      return result.value.trim()
    }
    case '.xlsx':
    case '.xls': {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const lines: string[] = []
      for (const sheetName of workbook.SheetNames) {
        lines.push(`=== ${sheetName} ===`)
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        lines.push(csv.trim())
      }
      return lines.join('\n')
    }
    case '.csv':
    case '.txt': {
      return buffer.toString('utf-8').trim()
    }
    default:
      throw new Error(`不支持的文件格式：${ext}`)
  }
}

function ensureSingleDefault(id: number) {
  db.prepare('UPDATE report_templates SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = datetime(\'now\')').run(id)
}

export const templateRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/templates', async () => {
    return db.prepare(`
      SELECT * FROM report_templates
      ORDER BY is_default DESC, updated_at DESC, id DESC
    `).all() as ReportTemplate[]
  })

  fastify.post('/templates', async request => {
    const body = request.body as { name?: string; content?: string; is_default?: number | boolean }
    const name = body.name?.trim()
    const content = body.content?.trim()
    if (!name) throw fastify.httpErrors.badRequest('模版名称不能为空')
    if (!content) throw fastify.httpErrors.badRequest('模版内容不能为空')

    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO report_templates (name, content, source_type, original_filename, is_default)
        VALUES (?, ?, 'text', NULL, ?)
      `).run(name, content, body.is_default ? 1 : 0)
      const id = Number(result.lastInsertRowid)
      if (body.is_default) ensureSingleDefault(id)
      return db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as ReportTemplate
    })

    return create()
  })

  // 上传本地文件作为模版（multipart）
  fastify.post('/templates/import', async (request, reply) => {
    const data = await request.file()
    if (!data) throw fastify.httpErrors.badRequest('请上传文件')

    const originalFilename = data.filename
    const ext = extname(originalFilename).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw fastify.httpErrors.badRequest(`不支持的文件格式，支持：${[...SUPPORTED_EXTENSIONS].join('、')}`)
    }

    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    let extractedText: string
    try {
      extractedText = await extractTextFromBuffer(buffer, ext)
    } catch (err) {
      throw fastify.httpErrors.badRequest(`文件解析失败：${err instanceof Error ? err.message : '未知错误'}`)
    }

    if (!extractedText.trim()) {
      throw fastify.httpErrors.badRequest('文件内容为空，无法导入为模版')
    }

    const name = basename(originalFilename, ext)
    const result = db.prepare(`
      INSERT INTO report_templates (name, content, source_type, original_filename, is_default)
      VALUES (?, ?, ?, ?, 0)
    `).run(name, extractedText, ext.slice(1), originalFilename)

    return db.prepare('SELECT * FROM report_templates WHERE id = ?').get(result.lastInsertRowid) as ReportTemplate
  })

  fastify.patch('/templates/:id', async request => {
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; content?: string; is_default?: number | boolean }
    const existing = db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as ReportTemplate | undefined
    if (!existing) throw fastify.httpErrors.notFound('Template not found')

    const name = body.name?.trim() ?? existing.name
    const content = body.content?.trim() ?? existing.content
    if (!name) throw fastify.httpErrors.badRequest('模版名称不能为空')
    if (!content) throw fastify.httpErrors.badRequest('模版内容不能为空')

    const update = db.transaction(() => {
      db.prepare(`
        UPDATE report_templates
        SET name = ?, content = ?, is_default = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name, content, body.is_default ? 1 : existing.is_default, id)
      if (body.is_default) ensureSingleDefault(Number(id))
      return db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as ReportTemplate
    })

    return update()
  })

  fastify.delete('/templates/:id', async request => {
    const { id } = request.params as { id: string }
    db.prepare('DELETE FROM report_templates WHERE id = ?').run(id)
    return { ok: true }
  })

  fastify.post('/templates/:id/set-default', async request => {
    const { id } = request.params as { id: string }
    const existing = db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as ReportTemplate | undefined
    if (!existing) throw fastify.httpErrors.notFound('Template not found')
    ensureSingleDefault(Number(id))
    return db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as ReportTemplate
  })
}
