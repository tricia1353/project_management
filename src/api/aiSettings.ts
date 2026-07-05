import { api } from './client'
import type { AISettings } from '@/types'

export async function getAISettings() {
  const { data } = await api.get<AISettings | null>('/ai-settings')
  return data
}

export async function saveAISettings(input: AISettings) {
  const { data } = await api.post<AISettings>('/ai-settings', input)
  return data
}

export async function testAISettings(input?: Partial<AISettings>) {
  const { data } = await api.post<{ ok: boolean; message: string; error?: string }>('/ai-settings/test', input)
  return data
}
