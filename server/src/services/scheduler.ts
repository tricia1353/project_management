import schedule from 'node-schedule'
import db from '../db/client.js'
import { scanFolder } from './scanner.js'
import logger from '../utils/logger.js'

// 每个 folderId 对应一个 ScheduledJob
const jobMap = new Map<number, schedule.Job>()

function intervalToCron(seconds: number): string {
  // 最小粒度 1 分钟
  const minutes = Math.max(1, Math.floor(seconds / 60))
  if (minutes < 60) return `*/${minutes} * * * *`
  const hours = Math.floor(minutes / 60)
  return `0 */${hours} * * *`
}

function registerJob(folderId: number, intervalSeconds: number) {
  // 取消旧 job
  const existing = jobMap.get(folderId)
  if (existing) {
    existing.cancel()
    jobMap.delete(folderId)
  }

  const cron = intervalToCron(intervalSeconds)
  const job = schedule.scheduleJob(cron, async () => {
    logger.info({ folderId, cron }, 'Scheduled scan triggered')
    try {
      await scanFolder(folderId)
    } catch (err) {
      logger.error({ folderId, err }, 'Scheduled scan error')
    }
  })

  if (job) {
    jobMap.set(folderId, job)
    logger.info({ folderId, cron }, 'Scheduled scan registered')
  }
}

/**
 * 启动时注册所有已启用文件夹的扫描调度
 */
export function initScheduler() {
  const folders = db
    .prepare('SELECT id, scan_interval_seconds FROM folders WHERE enabled = 1')
    .all() as { id: number; scan_interval_seconds: number }[]

  for (const folder of folders) {
    registerJob(folder.id, folder.scan_interval_seconds)
  }

  logger.info({ count: folders.length }, 'Scheduler initialized')
}

/**
 * 设置变更后刷新某个文件夹的调度（调用方自行读取最新状态）
 */
export function refreshFolderSchedule(folderId: number) {
  const folder = db
    .prepare('SELECT id, scan_interval_seconds, enabled FROM folders WHERE id = ?')
    .get(folderId) as { id: number; scan_interval_seconds: number; enabled: number } | undefined

  if (!folder || !folder.enabled) {
    const existing = jobMap.get(folderId)
    if (existing) {
      existing.cancel()
      jobMap.delete(folderId)
    }
    return
  }

  registerJob(folder.id, folder.scan_interval_seconds)
}

/**
 * 手动触发某个文件夹扫描（来自 API）
 */
export async function triggerScanForFolder(folderId: number) {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as
    | { id: number }
    | undefined
  if (!folder) throw new Error(`Folder ${folderId} not found`)
  return scanFolder(folderId)
}

export function stopAllJobs() {
  for (const [, job] of jobMap) {
    job.cancel()
  }
  jobMap.clear()
}
