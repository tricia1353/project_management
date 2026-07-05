import type { FastifyPluginAsync } from 'fastify'
import { getProjectStatusSettings, saveProjectStatusSettings } from '../services/projectActivity.js'

export const appSettingsRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/settings/project-status', async () => {
    return getProjectStatusSettings()
  })

  fastify.put('/settings/project-status', async request => {
    const body = request.body as { active_days: unknown; needs_review_days: unknown }
    try {
      return saveProjectStatusSettings({
        active_days: Number(body.active_days),
        needs_review_days: Number(body.needs_review_days),
      })
    } catch (e: unknown) {
      throw fastify.httpErrors.badRequest((e as Error).message)
    }
  })
}
