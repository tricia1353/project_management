import { api } from './client'

export interface ChatSession {
  id: number
  title: string
  created_at: string
  updated_at: string
  last_message?: string | null
}

export interface ChatCitation {
  file_id: number
  filename: string
  relative_path: string
}

export interface ChatMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant'
  content: string
  citations_json: string | null
  citations: ChatCitation[]
  created_at: string
}

export interface ChatStreamCallbacks {
  onDelta?: (text: string) => void
  onDone?: (citations: ChatCitation[]) => void
  onError?: (message: string) => void
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const { data } = await api.get<ChatSession[]>('/chat/sessions')
  return data
}

export async function createChatSession(input?: { title?: string }): Promise<ChatSession> {
  const { data } = await api.post<ChatSession>('/chat/sessions', input ?? {})
  return data
}

export async function deleteChatSession(id: number): Promise<void> {
  await api.delete(`/chat/sessions/${id}`)
}

export async function getChatMessages(sessionId: number): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
  return data
}

export function streamChatMessage(
  sessionId: number,
  userMessage: string,
  callbacks: ChatStreamCallbacks,
): () => void {
  const controller = new AbortController()

  ;(async () => {
    let response: Response
    try {
      response = await fetch(`/api/chat/sessions/${sessionId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError?.(err instanceof Error ? err.message : '请求失败')
      }
      return
    }

    if (!response.ok) {
      let msg = `HTTP ${response.status}`
      try {
        const json = await response.json() as { error?: string; message?: string }
        msg = json.error ?? json.message ?? msg
      } catch { /* ignore */ }
      callbacks.onError?.(msg)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError?.('不支持流式响应')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch {
        break
      }
      if (chunk.done) break

      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      let eventName = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim()
          try {
            const data = JSON.parse(raw)
            if (eventName === 'delta') {
              callbacks.onDelta?.(String(data.text ?? ''))
            } else if (eventName === 'done') {
              callbacks.onDone?.(Array.isArray(data.citations) ? data.citations : [])
            } else if (eventName === 'error') {
              callbacks.onError?.(String(data.message ?? 'AI 回复失败'))
            }
          } catch { /* malformed JSON — skip */ }
          eventName = ''
        }
      }
    }
  })()

  return () => controller.abort()
}
