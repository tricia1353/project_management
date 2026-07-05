import type { AIProvider, ChatMessage } from './types.js'

interface OpenAICompatOptions {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export class OpenAICompatProvider implements AIProvider {
  constructor(private readonly options: OpenAICompatOptions) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const endpoint = this.resolveEndpoint('/chat/completions')

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.options.apiKey ? `Bearer ${this.options.apiKey}` : '',
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        temperature: this.options.temperature,
        max_tokens: this.options.maxTokens,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`AI request failed: ${response.status} ${text}`)
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI response has no content')
    return content
  }

  async isAvailable(): Promise<boolean> {
    const reply = await this.chat([{ role: 'user', content: '请回复：连接成功' }])
    return reply.includes('连接成功') || reply.length > 0
  }

  /**
   * 将用户填入的 base_url 补全为完整的 chat/completions 端点。
   * 支持以下格式：
   *   https://api.example.com            → .../v1/chat/completions
   *   https://api.example.com/v1         → .../v1/chat/completions
   *   https://api.example.com/v1/        → .../v1/chat/completions
   *   https://api.example.com/v1/chat/completions  → 直接用
   */
  private resolveEndpoint(path: string): string {
    const base = this.options.baseUrl.replace(/\/$/, '')
    if (base.endsWith('/chat/completions')) return base
    if (/\/v\d+$/.test(base)) return `${base}${path}`
    return `${base}/v1${path}`
  }
}
