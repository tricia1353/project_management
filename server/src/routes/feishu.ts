import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'
import type { FeishuSettings } from '../types.js'
import { getActiveFeishuSettings, testFeishuConnection, pushReportToFeishu } from '../services/feishu.js'
import { buildReport } from './reports.js'

function boolToInt(v: unknown): number {
  return v == null ? 0 : Number(v) ? 1 : 0
}

export const feishuRoutes: FastifyPluginAsync = async fastify => {
  // 读取飞书设置
  fastify.get('/feishu-settings', async () => {
    return db.prepare('SELECT * FROM feishu_settings ORDER BY id DESC LIMIT 1').get() ?? null
  })

  // 保存飞书设置（单行 upsert）
  fastify.post('/feishu-settings', async request => {
    const body = request.body as Partial<FeishuSettings>
    const existing = db.prepare('SELECT id FROM feishu_settings ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined

    if (existing) {
      db.prepare(`
        UPDATE feishu_settings
        SET app_id = ?, app_secret = ?, document_id = ?, owner_open_id = ?, base_url = ?, enabled = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.app_id ?? '',
        body.app_secret ?? '',
        body.document_id ?? '',
        body.owner_open_id ?? '',
        body.base_url ?? 'https://open.feishu.cn',
        boolToInt(body.enabled),
        existing.id,
      )
      return db.prepare('SELECT * FROM feishu_settings WHERE id = ?').get(existing.id)
    }

    const result = db.prepare(`
      INSERT INTO feishu_settings (app_id, app_secret, document_id, owner_open_id, base_url, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      body.app_id ?? '',
      body.app_secret ?? '',
      body.document_id ?? '',
      body.owner_open_id ?? '',
      body.base_url ?? 'https://open.feishu.cn',
      boolToInt(body.enabled),
    )
    return db.prepare('SELECT * FROM feishu_settings WHERE id = ?').get(result.lastInsertRowid)
  })

  // 测试飞书连接（用请求体优先，否则用已存设置）
  fastify.post('/feishu-settings/test', async request => {
    const body = request.body as Partial<FeishuSettings> | undefined
    const settings: FeishuSettings | null = body?.app_id && body?.app_secret
      ? {
          id: 0,
          app_id: body.app_id,
          app_secret: body.app_secret,
          document_id: body.document_id ?? '',
          owner_open_id: body.owner_open_id ?? '',
          base_url: body.base_url ?? 'https://open.feishu.cn',
          enabled: 1,
          created_at: '',
          updated_at: '',
        }
      : getActiveFeishuSettings()

    if (!settings) return { ok: false, message: '请先填写 app_id 与 app_secret' }
    return testFeishuConnection(settings)
  })

  // 生成报告并推送到飞书文档
  fastify.post('/feishu/push-report', async request => {
    const settings = getActiveFeishuSettings()
    if (!settings || !settings.enabled) {
      throw fastify.httpErrors.badRequest('飞书未启用：请先在「设置」中配置并启用飞书')
    }

    const { markdown } = await buildReport(request.body as { startDate: string; endDate: string; folderIds?: number[] })
    const result = await pushReportToFeishu(markdown, settings)
    return { ok: true, ...result }
  })
}
