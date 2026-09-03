import { api } from './client'
import type { FeishuSettings } from '@/types'

export async function getFeishuSettings() {
  const { data } = await api.get<FeishuSettings | null>('/feishu-settings')
  return data
}

export async function saveFeishuSettings(input: FeishuSettings) {
  const { data } = await api.post<FeishuSettings>('/feishu-settings', input)
  return data
}

export async function testFeishuSettings(input?: Partial<FeishuSettings>) {
  const { data } = await api.post<{ ok: boolean; message: string; error?: string }>('/feishu-settings/test', input)
  return data
}

export async function pushReportToFeishu(input: { startDate: string; endDate: string; folderIds?: number[] }) {
  const { data } = await api.post<{ ok: boolean; document_id: string; url: string }>('/feishu/push-report', input)
  return data
}
