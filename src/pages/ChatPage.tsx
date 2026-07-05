import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ChatCitation, ChatMessage } from '@/api/chat'
import { streamChatMessage } from '@/api/chat'
import { useTemplates } from '@/hooks/useTemplates'
import {
  useChatSessions, useCreateChatSession, useDeleteChatSession,
  useChatMessages, useInvalidateChatMessages,
} from '@/hooks/useChat'
import { TemplateManager } from '@/components/TemplateManager'
import type { ReportTemplate } from '@/api/templates'
import styles from './ChatPage.module.css'

interface StreamingMessage {
  content: string
  citations: ChatCitation[]
}

export default function ChatPage() {
  const { data: sessions = [] } = useChatSessions()
  const createSession = useCreateChatSession()
  const deleteSession = useDeleteChatSession()
  const { data: templates = [] } = useTemplates()
  const invalidateChat = useInvalidateChatMessages()

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const { data: messages = [] } = useChatMessages(activeSessionId)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingMsg, setStreamingMsg] = useState<StreamingMessage | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  const abortRef = useRef<(() => void) | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMsg])

  useEffect(() => {
    return () => abortRef.current?.()
  }, [])

  async function handleNewSession() {
    const session = await createSession.mutateAsync({})
    setActiveSessionId(session.id)
    setStreamingMsg(null)
    setStreamError(null)
  }

  async function handleDeleteSession(id: number) {
    if (!confirm('确认删除此对话？')) return
    await deleteSession.mutateAsync(id)
    if (activeSessionId === id) {
      setActiveSessionId(null)
      setStreamingMsg(null)
    }
  }

  function handleSelectTemplate(t: ReportTemplate) {
    setInput(t.content)
    setShowTemplatePicker(false)
  }

  async function handleSend() {
    if (!input.trim() || !activeSessionId || streaming) return
    const msg = input.trim()
    setInput('')
    setStreamError(null)
    setStreaming(true)
    setStreamingMsg({ content: '', citations: [] })

    abortRef.current?.()
    abortRef.current = streamChatMessage(activeSessionId, msg, {
      onDelta: text => setStreamingMsg(prev => prev ? { ...prev, content: prev.content + text } : { content: text, citations: [] }),
      onDone: citations => {
        setStreaming(false)
        setStreamingMsg(null)
        invalidateChat(activeSessionId)
        if (citations.length > 0) {
          setStreamingMsg(null)
          setTimeout(() => invalidateChat(activeSessionId), 100)
        }
      },
      onError: message => {
        setStreaming(false)
        setStreamingMsg(null)
        setStreamError(message)
        invalidateChat(activeSessionId)
      },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const defaultTemplate = templates.find(t => t.is_default === 1)

  return (
    <div className={styles.page}>
      {/* 左侧会话列表 */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>对话历史</span>
          <button className={styles.btnNew} onClick={handleNewSession} type="button">＋</button>
        </div>
        <div className={styles.sessionList}>
          {sessions.length === 0 ? (
            <div className={styles.emptySession}>点击 ＋ 新建对话</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`${styles.sessionItem} ${s.id === activeSessionId ? styles.sessionActive : ''}`}
                onClick={() => { setActiveSessionId(s.id); setStreamingMsg(null); setStreamError(null) }}
              >
                <div className={styles.sessionTitle}>{s.title}</div>
                <div className={styles.sessionMeta}>{s.updated_at.slice(0, 10)}</div>
                <button
                  className={styles.btnDeleteSession}
                  onClick={e => { e.stopPropagation(); handleDeleteSession(s.id) }}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div className={styles.sidebarFooter}>
          <button
            className={styles.btnManageTemplates}
            onClick={() => setShowTemplateManager(true)}
            type="button"
          >
            📋 管理模版
          </button>
        </div>
      </aside>

      {/* 右侧对话区 */}
      <div className={styles.chatArea}>
        {!activeSessionId ? (
          <div className={styles.emptyChat}>
            <div className={styles.emptyChatIcon}>💬</div>
            <p>选择一个对话，或点击「＋」新建对话</p>
            <p className={styles.emptyChatHint}>AI 会基于你的所有项目和文件数据进行回答，并给出文件引用。</p>
          </div>
        ) : (
          <>
            <div className={styles.messages}>
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {streamingMsg && (
                <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                  <div className={styles.bubbleContent}>
                    {streamingMsg.content || <span className={styles.typing}>···</span>}
                  </div>
                </div>
              )}
              {streamError && (
                <div className={styles.errorBanner}>{streamError}</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
              <div className={styles.inputToolbar}>
                <div className={styles.templateRow}>
                  {defaultTemplate && (
                    <button
                      className={styles.btnTemplate}
                      onClick={() => setInput(defaultTemplate.content)}
                      type="button"
                    >
                      📋 {defaultTemplate.name}
                    </button>
                  )}
                  <button
                    className={styles.btnTemplate}
                    onClick={() => setShowTemplatePicker(v => !v)}
                    type="button"
                  >
                    ▾ 选模版
                  </button>
                </div>
                {showTemplatePicker && (
                  <div className={styles.templatePicker}>
                    {templates.length === 0 ? (
                      <div className={styles.templatePickerEmpty}>
                        暂无模版，<button onClick={() => { setShowTemplateManager(true); setShowTemplatePicker(false) }}>去新建</button>
                      </div>
                    ) : (
                      templates.map(t => (
                        <button
                          key={t.id}
                          className={styles.templatePickerItem}
                          onClick={() => handleSelectTemplate(t)}
                          type="button"
                        >
                          {t.name}
                          {t.is_default === 1 && <span className={styles.defaultTag}>默认</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className={styles.inputRow}>
                <textarea
                  className={styles.textarea}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入问题，或选择模版后编辑发送… (Enter 发送，Shift+Enter 换行)"
                  rows={3}
                  disabled={streaming}
                />
                <button
                  className={styles.btnSend}
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  type="button"
                >
                  {streaming ? '…' : '发送'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <TemplateManager
        open={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        onSelect={handleSelectTemplate}
      />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const citations = message.citations ?? []

  return (
    <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
      <div className={styles.bubbleContent}>
        {message.content}
      </div>
      {!isUser && citations.length > 0 && (
        <div className={styles.citations}>
          <span className={styles.citationsLabel}>📎 引用文件：</span>
          {citations.map(c => (
            <Link
              key={c.file_id}
              to={`/files/${c.file_id}`}
              className={styles.citationTag}
            >
              {c.filename}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
