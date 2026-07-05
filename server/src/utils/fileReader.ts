import { readFile, stat } from 'fs/promises'
import { extname } from 'path'
import { MAX_CONTENT_BYTES, TEXT_EXTENSIONS } from '../config.js'

export function isTextFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

/**
 * 读取文本文件内容，超过 MAX_CONTENT_BYTES 时截断。
 */
export async function readTextContent(filePath: string): Promise<{ content: string; truncated: boolean }> {
  if (!isTextFile(filePath)) {
    return { content: '', truncated: false }
  }

  const fileStat = await stat(filePath)
  const buffer = await readFile(filePath)
  const truncated = fileStat.size > MAX_CONTENT_BYTES
  const content = buffer.subarray(0, MAX_CONTENT_BYTES).toString('utf-8')

  return {
    content: truncated ? `${content}\n\n...（内容已截断，仅展示前 ${MAX_CONTENT_BYTES} 字节）` : content,
    truncated,
  }
}
