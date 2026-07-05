import { useState } from 'react'
import type { AppMessage } from '@/api/messages'
import {
  useMessages, useAnalyzeProjectHealth, useDismissMessage,
  useArchiveMessageProject, useAddMessageProjectEvent, useRemindMessage, useMarkMessageRead,
} from '@/hooks/useMessages'
import styles from './MessagesPage.module.css'

type ActionPanelState =
  | { type: 'none' }
  | { type: 'add-event'; id: number }
  | { type: 'remind'; id: number }

const HEALTH_LABEL: Record<string, string> = {
  stalled: '停滞',
  needs_review: '需关注',
  active: '活跃',
}

const HEALTH_COLOR: Record<string, string> = {
  stalled: '#dc2626',
  needs_review: '#d97706',
  active: '#16a34a',
}

export default function MessagesPage() {
  const { data: messages = [], isFetching } = useMessages('active')
  const analyzeHealth = useAnalyzeProjectHealth()
  const dismiss = useDismissMessage()
  const archiveProject = useArchiveMessageProject()
  const addEvent = useAddMessageProjectEvent()
  const remind = useRemindMessage()
  const markRead = useMarkMessageRead()

  const [actionPanel, setActionPanel] = useState<ActionPanelState>({ type: 'none' })
  const [eventInput, setEventInput] = useState('')
  const [remindInput, setRemindInput] = useState('')
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null)

  async function handleAnalyze() {
    setAnalyzeResult(null)
    const result = await analyzeHealth.mutateAsync()
    if (result.message) {
      setAnalyzeResult(result.message)
    } else {
      setAnalyzeResult(`已生成 ${result.generated} 条健康提醒`)
    }
  }

  async function handleArchive(msg: AppMessage) {
    if (!confirm(`确认将项目「${msg.project_name ?? msg.project_id}」直接归档？`)) return
    await archiveProject.mutateAsync(msg.id)
  }

  async function handleAddEvent(msgId: number) {
    if (!eventInput.trim()) return
    await addEvent.mutateAsync({ id: msgId, body: eventInput.trim() })
    setEventInput('')
    setActionPanel({ type: 'none' })
  }

  async function handleRemind(msgId: number) {
    if (!remindInput) return
    const date = new Date(remindInput)
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      alert('请选择未来的时间')
      return
    }
    await remind.mutateAsync({ id: msgId, remindAt: date.toISOString() })
    setRemindInput('')
    setActionPanel({ type: 'none' })
  }

  function togglePanel(msg: AppMessage, type: 'add-event' | 'remind') {
    if (actionPanel.type === type && actionPanel.id === msg.id) {
      setActionPanel({ type: 'none' })
    } else {
      setActionPanel({ type, id: msg.id })
      if (msg.status === 'unread') markRead.mutate(msg.id)
    }
  }

  const unreadCount = messages.filter(m => m.status === 'unread').length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>消息</h1>
          <p>项目健康度提醒与待处理事项。</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.btnAnalyze}
            onClick={handleAnalyze}
            disabled={analyzeHealth.isPending}
            type="button"
          >
            {analyzeHealth.isPending ? '分析中…' : '🔄 刷新健康分析'}
          </button>
        </div>
      </div>

      {analyzeResult && (
        <div className={styles.analyzeResult}>
          {analyzeResult}
          <button onClick={() => setAnalyzeResult(null)} type="button">×</button>
        </div>
      )}

      <div className={styles.summary}>
        <span className={styles.badge}>{messages.length} 条消息</span>
        {unreadCount > 0 && <span className={styles.badgeUnread}>{unreadCount} 未读</span>}
        {isFetching && <span className={styles.fetching}>刷新中…</span>}
      </div>

      {messages.length === 0 && !analyzeHealth.isPending ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <p>暂无需要处理的消息</p>
          <p className={styles.emptyHint}>点击「刷新健康分析」检查项目状态</p>
        </div>
      ) : (
        <div className={styles.list}>
          {messages.map(msg => {
            const metadata = msg.metadata_json ? JSON.parse(msg.metadata_json) as { health_status?: string } : {}
            const healthStatus = metadata.health_status ?? ''
            const isActionOpen = actionPanel.type !== 'none' && actionPanel.id === msg.id

            return (
              <div key={msg.id} className={`${styles.card} ${msg.status === 'unread' ? styles.cardUnread : ''}`}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleRow}>
                    {msg.status === 'unread' && <span className={styles.dot} />}
                    <span className={styles.cardTitle}>{msg.title}</span>
                    {healthStatus && (
                      <span
                        className={styles.healthBadge}
                        style={{ background: `${HEALTH_COLOR[healthStatus]}18`, color: HEALTH_COLOR[healthStatus] }}
                      >
                        {HEALTH_LABEL[healthStatus] ?? healthStatus}
                      </span>
                    )}
                  </div>
                  {msg.project_name && (
                    <div className={styles.projectTag}>📁 {msg.project_path ?? msg.project_name}</div>
                  )}
                </div>

                <div className={styles.cardBody}>{msg.body}</div>

                {msg.remind_at && (
                  <div className={styles.remindTag}>
                    ⏰ 提醒时间：{new Date(msg.remind_at).toLocaleString('zh-CN')}
                  </div>
                )}

                <div className={styles.actions}>
                  <button
                    className={styles.btnArchive}
                    onClick={() => handleArchive(msg)}
                    disabled={!msg.project_id || archiveProject.isPending}
                    title={!msg.project_id ? '无关联项目' : ''}
                    type="button"
                  >
                    ✅ 直接归档
                  </button>
                  <button
                    className={`${styles.btnAddEvent} ${isActionOpen && actionPanel.type === 'add-event' ? styles.btnActive : ''}`}
                    onClick={() => togglePanel(msg, 'add-event')}
                    type="button"
                  >
                    📝 添加状态
                  </button>
                  <button
                    className={`${styles.btnRemind} ${isActionOpen && actionPanel.type === 'remind' ? styles.btnActive : ''}`}
                    onClick={() => togglePanel(msg, 'remind')}
                    type="button"
                  >
                    ⏰ 后续提醒
                  </button>
                  <button
                    className={styles.btnDismiss}
                    onClick={() => dismiss.mutate(msg.id)}
                    type="button"
                  >
                    忽略
                  </button>
                </div>

                {isActionOpen && actionPanel.type === 'add-event' && (
                  <div className={styles.inlinePanel}>
                    <input
                      className={styles.inlineInput}
                      value={eventInput}
                      onChange={e => setEventInput(e.target.value)}
                      placeholder="输入项目状态动态，如：已和负责人确认，下周恢复推进"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleAddEvent(msg.id)}
                    />
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.btnConfirm}
                        onClick={() => handleAddEvent(msg.id)}
                        disabled={!eventInput.trim() || addEvent.isPending}
                        type="button"
                      >
                        {addEvent.isPending ? '提交中…' : '确认'}
                      </button>
                      <button
                        className={styles.btnCancelInline}
                        onClick={() => setActionPanel({ type: 'none' })}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {isActionOpen && actionPanel.type === 'remind' && (
                  <div className={styles.inlinePanel}>
                    <label className={styles.remindLabel}>选择提醒时间</label>
                    <input
                      className={styles.inlineInput}
                      type="datetime-local"
                      value={remindInput}
                      onChange={e => setRemindInput(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    />
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.btnConfirm}
                        onClick={() => handleRemind(msg.id)}
                        disabled={!remindInput || remind.isPending}
                        type="button"
                      >
                        {remind.isPending ? '设置中…' : '设置提醒'}
                      </button>
                      <button
                        className={styles.btnCancelInline}
                        onClick={() => setActionPanel({ type: 'none' })}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
