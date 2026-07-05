import { createHash } from 'crypto'
import { createReadStream } from 'fs'

/**
 * 计算文件 SHA256 checksum（流式读取，适合大文件）
 */
export function computeChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
