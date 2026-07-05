import type { FastifyPluginAsync } from 'fastify'
import db from '../db/client.js'
import { createAIProvider } from '../ai/factory.js'
import type { AISettings, ProjectSummary, ScanRecord } from '../types.js'
import { getProjectAssignmentStats } from './projects.js'

interface ReportParams {
  startDate: string   // 'YYYY-MM-DD'
  endDate: string
  folderIds?: number[]
}

interface ScanStats {
  total_added: number
  total_modified: number
  total_deleted: number
  scan_count: number
}

function buildMarkdown(opts: {
  startDate: string
  endDate: string
  scanStats: ScanStats
  projectActivity: Array<{ name: string; files_added_count: number }>
  summaries: Array<{ summary_text: string; suggested_next_step: string | null }>
  aiOverallSummary: string
}): string {
  const { startDate, endDate, scanStats, projectActivity, summaries, aiOverallSummary } = opts
  const now = new Date().toLocaleString('zh-CN')

  const lines: string[] = [
    `# 工作报告（${startDate} ~ ${endDate}）`,
    '',
    `> 生成时间：${now}`,
    '',
    '## 文件变化概览',
    '',
    '| 指标 | 数量 |',
    '|------|------|',
    `| 新增文件 | ${scanStats.total_added} |`,
    `| 修改文件 | ${scanStats.total_modified} |`,
    `| 删除文件 | ${scanStats.total_deleted} |`,
    `| 扫描次数 | ${scanStats.scan_count} |`,
    '',
    '## 项目整理进展',
    '',
  ]

  if (projectActivity.length === 0) {
    lines.push('本时间段内未有文件归入项目。')
  } else {
    for (const p of projectActivity) {
      lines.push(`- **${p.name}**：新增 ${p.files_added_count} 个文件`)
    }
  }

  lines.push('', '## AI 项目进度总结', '')

  if (aiOverallSummary) {
    lines.push(aiOverallSummary)
  } else if (summaries.length > 0) {
    for (const s of summaries.slice(0, 5)) {
      lines.push(`- ${s.summary_text}`)
      if (s.suggested_next_step) lines.push(`  - 建议：${s.suggested_next_step}`)
    }
  } else {
    lines.push('暂无 AI 总结（未配置 AI 或时间段内无扫描）。')
  }

  lines.push('', '---', '', '*由 Project Folder Kanban 自动生成*')

  return lines.join('\n')
}

export const reportRoutes: FastifyPluginAsync = async fastify => {
  fastify.post('/reports/generate', async request => {
    const body = request.body as ReportParams

    if (!body.startDate || !body.endDate) {
      throw fastify.httpErrors.badRequest('startDate and endDate are required')
    }

    const start = body.startDate
    const end = body.endDate + ' 23:59:59'

    const folderFilter = body.folderIds?.length
      ? `AND folder_id IN (${body.folderIds.map(() => '?').join(',')})`
      : ''
    const folderParams: number[] = body.folderIds ?? []

    // 1. 扫描汇总
    const scanStats = db
      .prepare(`
        SELECT
          COALESCE(SUM(files_added), 0)    AS total_added,
          COALESCE(SUM(files_modified), 0) AS total_modified,
          COALESCE(SUM(files_deleted), 0)  AS total_deleted,
          COUNT(*)                          AS scan_count
        FROM scans
        WHERE status = 'completed'
          AND started_at >= ?
          AND started_at <= ?
          ${folderFilter}
      `)
      .get(start, end, ...folderParams) as ScanStats

    // 2. 项目整理进展
    const projectActivity = getProjectAssignmentStats(body.startDate, body.endDate)

    // 3. 近期 project_summaries
    const summaries = db
      .prepare(`
        SELECT summary_text, suggested_next_step, generated_at
        FROM project_summaries
        WHERE generated_at >= ? AND generated_at <= ?
        ORDER BY generated_at DESC
        LIMIT 10
      `)
      .all(start, end) as Array<{ summary_text: string; suggested_next_step: string | null; generated_at: string }>

    // 4. 尝试 AI 生成整体总结（可选）
    let aiOverallSummary = ''
    const provider = createAIProvider()

    if (provider && (scanStats.total_added > 0 || scanStats.total_modified > 0 || summaries.length > 0)) {
      const context = [
        `时间段：${body.startDate} ~ ${body.endDate}`,
        `文件变动：新增 ${scanStats.total_added} 个，修改 ${scanStats.total_modified} 个，删除 ${scanStats.total_deleted} 个`,
        projectActivity.length > 0
          ? `整理进展：${projectActivity.map(p => `${p.name}（+${p.files_added_count}个文件）`).join('、')}`
          : '整理进展：本时间段内未整理文件到项目',
      ]

      if (summaries.length > 0) {
        context.push('各扫描 AI 摘要：', ...summaries.slice(0, 5).map(s => `- ${s.summary_text}`))
      }

      try {
        aiOverallSummary = await provider.chat([
          {
            role: 'system',
            content:
              '你是项目助手，请根据以下信息生成一段简洁的工作总结（3-5句话，中文），适合直接粘贴进周报或日报。',
          },
          { role: 'user', content: context.join('\n') },
        ])
      } catch {
        aiOverallSummary = ''
      }
    }

    const markdown = buildMarkdown({
      startDate: body.startDate,
      endDate: body.endDate,
      scanStats,
      projectActivity,
      summaries,
      aiOverallSummary,
    })

    return { markdown }
  })
}
