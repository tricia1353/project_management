import { api } from './client'

export interface AppMessage {
  id: number
  type: string
  title: string
  body: string
  project_id: number | null
  project_name?: string | null
  project_path?: string | null
  metadata_json: string | null
  status: 'unread' | 'read' | 'dismissed'
  remind_at: string | null
  created_at: string
  updated_at: string
}

export async function getMessages(params?: { status?: 'active' | 'unread' | 'all' }): Promise<AppMessage[]> {
  const { data } = await api.get<AppMessage[]>('/messages', { params })
  return data
}

export async function getUnreadMessageCount(): Promise<{ count: number }> {
  const { data } = await api.get<{ count: number }>('/messages/unread-count')
  return data
}

export async function markMessageRead(id: number): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`/messages/${id}/read`)
  return data
}

export async function dismissMessage(id: number): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`/messages/${id}/dismiss`)
  return data
}

export async function archiveMessageProject(id: number): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`/messages/${id}/archive-project`)
  return data
}

export async function addMessageProjectEvent(id: number, body: string): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`/messages/${id}/add-event`, { body })
  return data
}

export async function remindMessage(id: number, remindAt: string): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`/messages/${id}/remind`, { remindAt })
  return data
}

export async function analyzeProjectHealth(): Promise<{ generated: number; total?: number; message?: string }> {
  const { data } = await api.post<{ generated: number; total?: number; message?: string }>('/ai/analyze-health')
  return data
}
