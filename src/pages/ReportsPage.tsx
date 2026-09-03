import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getFolders } from '@/api/folders'
import { generateReport } from '@/api/reports'
import { pushReportToFeishu } from '@/api/feishu'
import MarkdownView from '@/components/common/MarkdownView'
import styles from './ReportsPage.module.css'

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function ReportsPage() {
  const today = new Date()
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const [startDate, setStartDate] = useState(fmt(weekAgo))
  const [endDate, setEndDate] = useState(fmt(today))
  const [folderIds, setFolderIds] = useState<number[]>([])
  const [markdown, setMarkdown] = useState('')

  const { data: folders = [] } = useQuery({
    queryKey: ['folders-all'],
    queryFn: () => getFolders(),
  })

  const mutation = useMutation({
    mutationFn: generateReport,
    onSuccess: data => setMarkdown(data.markdown),
  })

  const [pushResult, setPushResult] = useState<{ ok: boolean; url?: string; message?: string } | null>(null)

  const pushMutation = useMutation({
    mutationFn: () => pushReportToFeishu({ startDate, endDate, folderIds: folderIds.length ? folderIds : undefined }),
    onSuccess: data => setPushResult({ ok: true, url: data.url }),
    onError: err => setPushResult({ ok: false, message: (err as Error).message }),
  })

  const toggleFolder = (id: number) => {
    setFolderIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const handleGenerate = () => {
    setMarkdown('')
    mutation.mutate({ startDate, endDate, folderIds: folderIds.length ? folderIds : undefined })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      alert('已复制到剪贴板')
    } catch {
      alert('复制失败')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `工作报告_${startDate}_${endDate}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>工作报告</h1>
        <p>选择时间范围与范围文件夹，一键生成带 AI 总结的工作周报 / 日报。</p>
      </div>

      <div className={styles.controls}>
        <div className={styles.field}>
          <label>开始日期</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>结束日期</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>范围（不选则统计全部文件夹）</label>
          <div className={styles.folderList}>
            {folders.length === 0 && <span className={styles.hint}>暂无文件夹</span>}
            {folders.map(f => (
              <label key={f.id} className={styles.folderItem}>
                <input
                  type="checkbox"
                  checked={folderIds.includes(f.id)}
                  onChange={() => toggleFolder(f.id)}
                />
                <span>{f.absolute_path}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleGenerate} disabled={mutation.isPending}>
            {mutation.isPending ? '生成中…' : '生成报告'}
          </button>
        </div>
      </div>

      {mutation.isError && (
        <div className={styles.error}>生成失败：{(mutation.error as Error).message}</div>
      )}

      {markdown && (
        <div className={styles.resultWrap}>
          <div className={styles.resultActions}>
            <button className={styles.btn} onClick={handleCopy}>
              复制
            </button>
            <button className={styles.btn} onClick={handleDownload}>
              下载 .md
            </button>
            <button
              className={styles.btnPrimary}
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending}
              title="将当前报告写入已配置的飞书云文档（覆盖更新）"
            >
              {pushMutation.isPending ? '推送中…' : '⬆ 推送到飞书'}
            </button>
          </div>
          {pushResult && (
            <div className={pushResult.ok ? styles.pushOk : styles.pushFail}>
              {pushResult.ok ? (
                <>
                  ✅ 已推送到飞书：<a href={pushResult.url} target="_blank" rel="noreferrer">{pushResult.url}</a>
                </>
              ) : (
                <>❌ 推送失败：{pushResult.message}</>
              )}
            </div>
          )}
          <div className={styles.result}>
            <MarkdownView content={markdown} />
          </div>
        </div>
      )}

      {!markdown && !mutation.isPending && (
        <div className={styles.empty}>选择条件后点击「生成报告」，报告将显示在这里。</div>
      )}
    </div>
  )
}
