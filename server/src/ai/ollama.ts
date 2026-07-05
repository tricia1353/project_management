import type { AIProvider, ChatMessage } from './types.js'

interface OllamaOptions {
  baseUrl: string
  model: string
  temperature: number
}

export class OllamaProvider implements AIProvider {
  constructor(private readonly options: OllamaOptions) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        stream: false,
        options: { temperature: this.options.temperature },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Ollama request failed: ${response.status} ${text}`)
    }

    const data = await response.json() as { message?: { content?: string } }
    return data.message?.content ?? ''
  }

  async isAvailable(): Promise<boolean> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/api/tags`)
    return response.ok
  }
}
