import { useState } from 'react'
import type { AppMessage } from '@/api/messages'
import {
  useMessages, useAnalyzeProjectHealth, useDismissMessage,
  useArchiveMessageProject, useAddMessageProjectEvent, useRemindMessage, useMarkMessageRead,
} from '@/hooks/useMessages'
import type { MessageFilter } from '@/hooks/useMessages'
import styles from './MessagesPage.module.css'

type ActionPanelState =
  | { type: 'none' }
  | { type: 'add-event'; id: number }
  | { type: 'remind'; id: number }

type Tab = 'active' | 'snoozed' | 'all'

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: '待处理' },
  { key: 'snoozed', label: '稍后提醒' },
  { key: 'all', label: '全部' },
]

const TYPE_LABEL: Record<string, string> = {
  manual_suggestion: '修改建议',
  health_alert: '项目提醒',
}

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

const EMPTY_TEXT: Record<Tab, { title: string; hint: string }> = {
  active: { title: '暂无待处理消息', hint: '点击「刷新健康分析」检查项目状态' },
  snoozed: { title: '暂无稍后提醒', hint: '设置了「稍后提醒」的消息会出现在这里' },
  all: { title: '暂无消息', hint: '' },
}

function parseMetadata(msg: AppMessage): { filename?: string; relative_path?: string; version_count?: number; health_status?: string } {
  if (!msg.metadata_json) return {}
  try {
    return JSON.parse(msg.metadata_json)
  } catch {
    return {}
  }
}

function getSubject(msg: AppMessage, metadata: ReturnType<typeof parseMetadata>) {
  if (metadata.filename) return metadata.filename
  if (msg.project_name) return msg.project_path ?? msg.project_name
  return null
}

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>('active')
  const filterMap: Record<Tab, MessageFilter> = { active: 'active', snoozed: 'snoozed', all: 'all' }
  const { data: messages = [], isFetching } = useMessages(filterMap[tab])
  const { data: activeMessages = [] } = useMessages('active')
  const { data: snoozedMessages = [] } = useMessages('snoozed')

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
  const [toast, setToast] = useState<string | null>(null)

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(current => (current === text ? null : current)), 3000)
  }

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
    showToast(`已设为 ${date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 提醒，可在「稍后提醒」查看`)
  }

  function togglePanel(msg: AppMessage, type: 'add-event' | 'remind') {
    if (actionPanel.type === type && actionPanel.id === msg.id) {
      setActionPanel({ type: 'none' })
    } else {
      setActionPanel({ type, id: msg.id })
      if (msg.status === 'unread') markRead.mutate(msg.id)
    }
  }

  const emptyText = EMPTY_TEXT[tab]

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

      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.tabs}>
        {TABS.map(t => {
          const count = t.key === 'active' ? activeMessages.length : t.key === 'snoozed' ? snoozedMessages.length : undefined
          return (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {typeof count === 'number' && count > 0 && <span className={styles.tabCount}>{count}</span>}
            </button>
          )
        })}
        {isFetching && <span className={styles.fetching}>刷新中…</span>}
      </div>

      {messages.length === 0 && !analyzeHealth.isPending ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <p>{emptyText.title}</p>
          {emptyText.hint && <p className={styles.emptyHint}>{emptyText.hint}</p>}
        </div>
      ) : (
        <div className={styles.list}>
          {messages.map(msg => {
            const metadata = parseMetadata(msg)
            const healthStatus = metadata.health_status ?? ''
            const subject = getSubject(msg, metadata)
            const isActionOpen = actionPanel.type !== 'none' && actionPanel.id === msg.id
            const typeLabel = TYPE_LABEL[msg.type] ?? msg.type

            return (
              <div key={msg.id} className={`${styles.card} ${msg.status === 'unread' ? styles.cardUnread : ''}`}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleRow}>
                    {msg.status === 'unread' && <span className={styles.dot} />}
                    <span className={styles.typeTag}>{typeLabel}</span>
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
                  {subject && <div className={styles.projectTag}>📁 {subject}</div>}
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
                    ✅ 完成
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
                    ⏰ 稍后提醒
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
