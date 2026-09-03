import db from '../db/client.js'
import type { FeishuSettings } from '../types.js'

const DEFAULT_BASE = 'https://open.feishu.cn'

export function getActiveFeishuSettings(): FeishuSettings | null {
  const row = db.prepare('SELECT * FROM feishu_settings ORDER BY id DESC LIMIT 1').get() as FeishuSettings | undefined
  return row ?? null
}

// ---------------------------------------------------------------------------
// 飞书访问令牌
// ---------------------------------------------------------------------------

interface TokenResp {
  code: number
  msg: string
  tenant_access_token?: string
  expire?: number
}

export async function getTenantAccessToken(settings: FeishuSettings): Promise<string> {
  const base = settings.base_url?.trim() || DEFAULT_BASE
  const resp = await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: settings.app_id, app_secret: settings.app_secret }),
  })
  const data = await resp.json() as TokenResp
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`获取飞书访问令牌失败：${data.msg || '未知错误'}(code=${data.code})`)
  }
  return data.tenant_access_token
}

// ---------------------------------------------------------------------------
// Markdown -> 飞书 DocX 块 转换器（覆盖标题/段落/列表/代码/表格/粗斜体）
// ---------------------------------------------------------------------------

interface TextElement {
  type: 1
  text_run: { content: string; text_element_style: { bold?: boolean; italic?: boolean } }
}

function textRun(content: string, style: { bold?: boolean; italic?: boolean } = {}): TextElement {
  return { type: 1, text_run: { content, text_element_style: style } }
}

// 解析行内 **粗体** 与 *斜体*
function parseInline(text: string): TextElement[] {
  const elements: TextElement[] = []
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) elements.push(textRun(text.slice(last, m.index)))
    if (m[2] != null) elements.push(textRun(m[2], { bold: true }))
    else if (m[3] != null) elements.push(textRun(m[3], { italic: true }))
    last = regex.lastIndex
  }
  if (last < text.length) elements.push(textRun(text.slice(last)))
  if (elements.length === 0) elements.push(textRun(text))
  return elements
}

interface DocxBlock {
  block_type: number
  [key: string]: unknown
}

function blockText(text: string): DocxBlock {
  return { block_type: 1, text: { elements: parseInline(text) } }
}

function blockHeading(level: 1 | 2 | 3, text: string): DocxBlock {
  const bt = level === 1 ? 2 : level === 2 ? 3 : 4
  const key = level === 1 ? 'heading1' : level === 2 ? 'heading2' : 'heading3'
  return { block_type: bt, [key]: { elements: parseInline(text) } }
}

function blockBullet(text: string): DocxBlock {
  return { block_type: 5, bullet: { elements: parseInline(text) } }
}

function blockOrdered(text: string): DocxBlock {
  return { block_type: 6, ordered: { elements: parseInline(text) } }
}

function blockCode(text: string): DocxBlock {
  return { block_type: 13, code: { elements: parseInline(text), style: { language: 1 } } }
}

function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 1
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

export function markdownToDocxBlocks(md: string): DocxBlock[] {
  const lines = md.split('\n')
  const blocks: DocxBlock[] = []
  let i = 0

  const pushPara = (text: string) => {
    const t = text.trim()
    if (t) blocks.push(blockText(t))
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 代码块 ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // 跳过收尾 ```
      blocks.push(blockCode(codeLines.join('\n')))
      continue
    }

    // 标题
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (h) {
      blocks.push(blockHeading(h[1].length as 1 | 2 | 3, h[2].trim()))
      i++
      continue
    }

    // 分隔线
    if (/^---+$/.test(trimmed) || /^===+$/.test(trimmed)) {
      i++
      continue
    }

    // 引用
    if (trimmed.startsWith('>')) {
      pushPara(trimmed.replace(/^>\s?/, ''))
      i++
      continue
    }

    // 表格：连续多行含 |
    if (isTableRow(line)) {
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      // 跳过表头与分隔行，渲染数据行
      const dataRows = rows
        .filter(r => !(r.length === 2 && /^-+$/.test(r[0].replace(/\|/g, '')) && /^-+$/.test(r[1].replace(/\|/g, ''))))
        .slice(1) // 去掉表头
      for (const r of dataRows) {
        if (r.length >= 2) blocks.push(blockBullet(`**${r[0]}**：${r.slice(1).join(' ')}`))
        else if (r.length === 1) pushPara(r[0])
      }
      continue
    }

    // 无序列表
    if (/^[-*+]\s+/.test(trimmed)) {
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        blocks.push(blockBullet(lines[i].trim().replace(/^[-*+]\s+/, '')))
        i++
      }
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(trimmed)) {
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        blocks.push(blockOrdered(lines[i].trim().replace(/^\d+\.\s+/, '')))
        i++
      }
      continue
    }

    // 空行
    if (trimmed === '') {
      i++
      continue
    }

    // 普通段落（合并连续非空非特殊行）
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('```') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !isTableRow(lines[i])
    ) {
      paraLines.push(lines[i].trim())
      i++
    }
    pushPara(paraLines.join(' '))
  }

  if (blocks.length === 0) blocks.push(blockText('（空内容）'))
  return blocks
}

// ---------------------------------------------------------------------------
// 写入飞书文档
// ---------------------------------------------------------------------------

interface PushResult {
  document_id: string
  url: string
}

async function createDoc(base: string, token: string, title: string): Promise<string> {
  const resp = await fetch(`${base}/open-apis/docx/v1/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, folder_token: '' }),
  })
  const data = await resp.json() as { code: number; msg: string; data?: { document?: { document_id?: string } } }
  if (data.code !== 0 || !data.data?.document?.document_id) {
    throw new Error(`创建飞书文档失败：${data.msg || '未知错误'}(code=${data.code})`)
  }
  return data.data.document.document_id
}

async function clearDoc(base: string, token: string, docId: string): Promise<void> {
  let count = 0
  let pageToken = ''
  do {
    const url = `${base}/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await resp.json() as { code: number; msg: string; data?: { items?: unknown[]; page_token?: string } }
    if (data.code !== 0) throw new Error(`读取文档内容失败：${data.msg || '未知错误'}(code=${data.code})`)
    count += data.data?.items?.length || 0
    pageToken = data.data?.page_token || ''
  } while (pageToken)

  if (count > 0) {
    const resp = await fetch(
      `${base}/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children?start_index=0&end_index=${count}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    const data = await resp.json() as { code: number; msg: string }
    if (data.code !== 0) throw new Error(`清空文档失败：${data.msg || '未知错误'}(code=${data.code})`)
  }
}

async function insertBlocks(base: string, token: string, docId: string, children: DocxBlock[]): Promise<void> {
  const resp = await fetch(`${base}/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ children, document_id: docId }),
  })
  const data = await resp.json() as { code: number; msg: string }
  if (data.code !== 0) throw new Error(`写入文档块失败：${data.msg || '未知错误'}(code=${data.code})`)
}

async function grantPermission(base: string, token: string, fileToken: string, openId: string): Promise<void> {
  await fetch(`${base}/open-apis/drive/v1/permissions/${fileToken}/members`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_type: 'openid', member_id: openId, perm: 'full_access', type: 'cloud_doc' }),
  })
}

export async function pushReportToFeishu(markdown: string, settings: FeishuSettings): Promise<PushResult> {
  if (!settings.app_id || !settings.app_secret) {
    throw new Error('飞书未配置：请先在设置中填写 app_id 与 app_secret')
  }

  const token = await getTenantAccessToken(settings)
  const base = settings.base_url?.trim() || DEFAULT_BASE

  let docId = settings.document_id?.trim()
  const createdNew = !docId
  if (createdNew) {
    docId = await createDoc(base, token, '项目进展报告')
    // 持久化文档 ID，后续覆盖更新
    db.prepare(`UPDATE feishu_settings SET document_id = ?, updated_at = datetime('now') WHERE id = ?`).run(docId, settings.id)
    if (settings.owner_open_id?.trim()) {
      await grantPermission(base, token, docId, settings.owner_open_id.trim()).catch(() => {})
    }
  }

  const blocks = markdownToDocxBlocks(markdown)

  await clearDoc(base, token, docId)
  const CHUNK = 50
  for (let i = 0; i < blocks.length; i += CHUNK) {
    await insertBlocks(base, token, docId, blocks.slice(i, i + CHUNK))
  }

  const url = `https://www.feishu.cn/docx/${docId}`
  return { document_id: docId, url }
}

export async function testFeishuConnection(settings: FeishuSettings): Promise<{ ok: boolean; message: string; error?: string }> {
  if (!settings.app_id || !settings.app_secret) {
    return { ok: false, message: '请先填写 app_id 与 app_secret' }
  }
  try {
    const token = await getTenantAccessToken(settings)
    if (!token) throw new Error('返回空令牌')
    return { ok: true, message: '飞书连接成功（已获取访问令牌）' }
  } catch (err) {
    return { ok: false, message: '连接失败', error: err instanceof Error ? err.message : String(err) }
  }
}
