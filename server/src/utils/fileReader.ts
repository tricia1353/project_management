import { readFile, stat } from 'fs/promises'
import { basename, extname } from 'path'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { MAX_CONTENT_BYTES, TEXT_EXTENSIONS } from '../config.js'

export type ExtractedFileKind = 'text' | 'document' | 'spreadsheet' | 'binary'
export type ExtractionStatus = 'content' | 'metadata' | 'error'

export interface ExtractedFileContent {
  kind: ExtractedFileKind
  content: string
  metadata: string
  truncated: boolean
  isText: boolean
  status: ExtractionStatus
  message?: string
}

export function isTextFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

function truncateContent(content: string) {
  if (Buffer.byteLength(content, 'utf8') <= MAX_CONTENT_BYTES) {
    return { content, truncated: false }
  }
  return { content: Buffer.from(content).subarray(0, MAX_CONTENT_BYTES).toString('utf-8'), truncated: true }
}

function buildMetadata(filePath: string, fileStat: Awaited<ReturnType<typeof stat>>, extra?: string) {
  const lines = [
    `文件名：${basename(filePath)}`,
    `扩展名：${extname(filePath).toLowerCase() || '无扩展名'}`,
    `大小：${fileStat.size} bytes`,
    `修改时间：${fileStat.mtime.toISOString()}`,
  ]
  if (extra) lines.push(extra)
  return lines.join('\n')
}

async function extractSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const range = sheet['!ref'] ?? '空表'
    const csv = XLSX.utils.sheet_to_csv(sheet).trim()
    lines.push(`=== ${sheetName} (${range}) ===`)
    if (csv) lines.push(csv)
  }
  return lines.join('\n')
}

export async function extractFileContent(filePath: string): Promise<ExtractedFileContent> {
  const ext = extname(filePath).toLowerCase()
  const fileStat = await stat(filePath)
  const buffer = await readFile(filePath)
  const metadata = buildMetadata(filePath, fileStat)

  try {
    if (TEXT_EXTENSIONS.has(ext)) {
      const truncated = fileStat.size > MAX_CONTENT_BYTES
      const content = buffer.subarray(0, MAX_CONTENT_BYTES).toString('utf-8')
      return { kind: 'text', content, metadata, truncated, isText: true, status: 'content' }
    }

    if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ buffer })
      const text = result.value.trim()
      if (text) {
        const truncated = truncateContent(text)
        return {
          kind: 'document',
          content: truncated.content,
          metadata: buildMetadata(filePath, fileStat, `可提取文本长度：${text.length} 字符`),
          truncated: truncated.truncated,
          isText: true,
          status: 'content',
        }
      }
      return { kind: 'document', content: metadata, metadata, truncated: false, isText: false, status: 'metadata', message: '未提取到正文，已使用文件元数据分析' }
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const text = await extractSpreadsheet(buffer)
      if (text.trim()) {
        const truncated = truncateContent(text)
        return {
          kind: 'spreadsheet',
          content: truncated.content,
          metadata: buildMetadata(filePath, fileStat, `工作表数量：${XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames.length}`),
          truncated: truncated.truncated,
          isText: true,
          status: 'content',
        }
      }
      return { kind: 'spreadsheet', content: metadata, metadata, truncated: false, isText: false, status: 'metadata', message: '未提取到表格文本，已使用文件元数据分析' }
    }

    const binaryMetadata = buildMetadata(filePath, fileStat, '正文不可直接提取，已使用文件元数据和版本特征分析')
    return { kind: 'binary', content: binaryMetadata, metadata: binaryMetadata, truncated: false, isText: false, status: 'metadata', message: '已使用文件元数据分析' }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const fallback = buildMetadata(filePath, fileStat, `提取失败：${errorMessage}；已使用文件元数据分析`)
    return { kind: TEXT_EXTENSIONS.has(ext) ? 'text' : 'binary', content: fallback, metadata: fallback, truncated: false, isText: false, status: 'error', message: '提取失败，已使用文件元数据分析' }
  }
}

/**
 * 读取文本文件内容，超过 MAX_CONTENT_BYTES 时截断。
 */
export async function readTextContent(filePath: string): Promise<{ content: string; truncated: boolean }> {
  if (!isTextFile(filePath)) {
    return { content: '', truncated: false }
  }

  const extracted = await extractFileContent(filePath)
  return { content: extracted.isText ? extracted.content : '', truncated: extracted.truncated }
}
