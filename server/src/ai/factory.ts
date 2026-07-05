import db from '../db/client.js'
import type { AISettings } from '../types.js'
import type { AIProvider } from './types.js'
import { OpenAICompatProvider } from './openaiCompat.js'
import { OllamaProvider } from './ollama.js'

export function getActiveAISettings(): AISettings | null {
  const settings = db
    .prepare('SELECT * FROM ai_settings WHERE enabled = 1 ORDER BY updated_at DESC, id DESC LIMIT 1')
    .get() as AISettings | undefined
  return settings ?? null
}

export function createAIProvider(settings = getActiveAISettings()): AIProvider | null {
  if (!settings || !settings.enabled || !settings.base_url || !settings.model) {
    return null
  }

  if (settings.provider === 'ollama') {
    return new OllamaProvider({
      baseUrl: settings.base_url,
      model: settings.model,
      temperature: settings.temperature,
    })
  }

  return new OpenAICompatProvider({
    baseUrl: settings.base_url,
    apiKey: settings.api_key,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
  })
}
