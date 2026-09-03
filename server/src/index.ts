import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import multipart from '@fastify/multipart'
import { SERVER_PORT } from './config.js'
import { runMigrations } from './db/migrations.js'
import { initScheduler, stopAllJobs } from './services/scheduler.js'
import { requeueStuckGroupedVersions } from './services/aiSummary.js'
import { folderRoutes } from './routes/folders.js'
import { fileRoutes } from './routes/files.js'
import { versionRoutes } from './routes/versions.js'
import { aiSettingsRoutes } from './routes/aiSettings.js'
import { aiRoutes } from './routes/ai.js'
import { appSettingsRoutes } from './routes/appSettings.js'
import { projectRoutes } from './routes/projects.js'
import { templateRoutes } from './routes/templates.js'
import { messageRoutes } from './routes/messages.js'
import { chatRoutes } from './routes/chat.js'
import { reportRoutes } from './routes/reports.js'
import { shareRoutes } from './routes/share.js'
import { feishuRoutes } from './routes/feishu.js'
import logger from './utils/logger.js'

async function bootstrap() {
  runMigrations()
  requeueStuckGroupedVersions()

  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  await app.register(cors, { origin: true })
  await app.register(sensible)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20MB

  await app.register(folderRoutes, { prefix: '/api' })
  await app.register(fileRoutes, { prefix: '/api' })
  await app.register(versionRoutes, { prefix: '/api' })
  await app.register(aiSettingsRoutes, { prefix: '/api' })
  await app.register(aiRoutes, { prefix: '/api' })
  await app.register(appSettingsRoutes, { prefix: '/api' })
  await app.register(projectRoutes, { prefix: '/api' })
  await app.register(templateRoutes, { prefix: '/api' })
  await app.register(messageRoutes, { prefix: '/api' })
  await app.register(chatRoutes, { prefix: '/api' })
  await app.register(shareRoutes, { prefix: '/api' })
  await app.register(reportRoutes, { prefix: '/api' })
  await app.register(feishuRoutes, { prefix: '/api' })

  app.get('/api/health', async () => ({ ok: true }))

  initScheduler()

  const shutdown = async () => {
    stopAllJobs()
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await app.listen({ port: SERVER_PORT, host: '0.0.0.0' })
  logger.info(`Server listening at http://localhost:${SERVER_PORT}`)
}

bootstrap().catch(err => {
  logger.error(err, 'Failed to start server')
  process.exit(1)
})
