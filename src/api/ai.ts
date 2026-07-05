export interface AssignmentSuggestion {
  file_id: number
  filename: string
  relative_path: string
  project_id: number
  project_name: string
  project_path: string
  confidence: number
  reason: string
  confident: boolean
}

/** 流式推送的单条 item，error 路径时部分字段缺失 */
export type SuggestionItem =
  | AssignmentSuggestion
  | {
      file_id: number
      filename: string
      relative_path: string
      confident: false
      error: string
      project_id?: never
      project_name?: never
      project_path?: never
      confidence?: never
      reason?: never
    }

export interface SuggestStartEvent {
  total: number
}

export interface SuggestDoneEvent {
  total: number
  threshold?: number
  message?: string
}

export interface SuggestCallbacks {
  onStart?: (total: number) => void
  onItem?: (item: SuggestionItem) => void
  onDone?: (e: SuggestDoneEvent) => void
  onError?: (err: string) => void
}

/**
 * SSE 流式分析——每分析完一个文件立即回调 onItem。
 * 返回一个 abort 函数，可用于提前中止。
 */
export function streamSuggestAssignments(
  params: { targetFolderId?: number; sourceFolderIds?: number[] },
  callbacks: SuggestCallbacks,
): () => void {
  const controller = new AbortController()

  ;(async () => {
    let response: Response
    try {
      response = await fetch('/api/ai/suggest-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
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
            if (eventName === 'start') {
              callbacks.onStart?.((data as SuggestStartEvent).total)
            } else if (eventName === 'item') {
              callbacks.onItem?.(data as SuggestionItem)
            } else if (eventName === 'done') {
              callbacks.onDone?.(data as SuggestDoneEvent)
            }
          } catch { /* malformed JSON — skip */ }
          eventName = ''
        }
      }
    }
  })()

  return () => controller.abort()
}
