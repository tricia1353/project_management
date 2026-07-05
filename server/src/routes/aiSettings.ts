import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'
import { createAIProvider } from '../ai/factory.js'
import type { AISettings } from '../types.js'

export const aiSettingsRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/ai-settings', async () => {
    return db.prepare('SELECT * FROM ai_settings ORDER BY updated_at DESC, id DESC LIMIT 1').get() ?? null
  })

  fastify.post('/ai-settings', async request => {
    const body = request.body as Partial<AISettings>

    const existing = db.prepare('SELECT id FROM ai_settings ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined

    if (existing) {
      db.prepare(`
        UPDATE ai_settings
        SET provider = ?, base_url = ?, api_key = ?, model = ?, temperature = ?, max_tokens = ?, enabled = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.provider ?? 'xinghe',
        body.base_url ?? '',
        body.api_key ?? '',
        body.model ?? '',
        body.temperature ?? 0.3,
        body.max_tokens ?? 1000,
        body.enabled == null ? 1 : Number(body.enabled) ? 1 : 0,
        existing.id,
      )
      return db.prepare('SELECT * FROM ai_settings WHERE id = ?').get(existing.id)
    }

    const result = db.prepare(`
      INSERT INTO ai_settings (provider, base_url, api_key, model, temperature, max_tokens, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.provider ?? 'xinghe',
      body.base_url ?? '',
      body.api_key ?? '',
      body.model ?? '',
      body.temperature ?? 0.3,
      body.max_tokens ?? 1000,
      body.enabled == null ? 1 : Number(body.enabled) ? 1 : 0,
    )

    return db.prepare('SELECT * FROM ai_settings WHERE id = ?').get(result.lastInsertRowid)
  })

  fastify.post('/ai-settings/test', async request => {
    const body = request.body as Partial<AISettings> | undefined
    const provider = body?.base_url && body?.model
      ? createAIProvider({
          id: 0,
          provider: body.provider ?? 'xinghe',
          base_url: body.base_url,
          api_key: body.api_key ?? '',
          model: body.model,
          temperature: body.temperature ?? 0.3,
          max_tokens: body.max_tokens ?? 1000,
          enabled: 1,
          created_at: '',
          updated_at: '',
        })
      : createAIProvider()

    if (!provider) {
      return { ok: false, message: '连接失败，请先填写 API 地址、API Key 和模型名称' }
    }

    try {
      await provider.isAvailable()
      return { ok: true, message: '模型连接成功' }
    } catch (err) {
      return {
        ok: false,
        message: '连接失败，请检查 API 地址、API Key 和模型名称',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}
