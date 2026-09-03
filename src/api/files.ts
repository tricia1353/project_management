import { api } from './client'
import type { KanbanStatus, ProjectFile, FileSuggestionHistoryEntry } from '@/types'

export async function getFiles(params: {
  folderId?: number | null
  search?: string
  extension?: string
  status?: string
  includeDeleted?: boolean
  processingStatus?: 'pending' | 'archived' | 'ignored' | 'all'
  scanId?: number | null
  latestScan?: boolean
}) {
  const { data } = await api.get<ProjectFile[]>('/files', { params })
  return data
}

export async function getFile(id: number) {
  const { data } = await api.get<ProjectFile>(`/files/${id}`)
  return data
}

export async function updateFileStatus(id: number, status: KanbanStatus) {
  const { data } = await api.patch<ProjectFile>(`/files/${id}/status`, { status })
  return data
}

export async function ignoreFile(id: number) {
  const { data } = await api.post<ProjectFile>(`/files/${id}/ignore`)
  return data
}

export async function restoreFile(id: number) {
  const { data } = await api.post<ProjectFile>(`/files/${id}/restore`)
  return data
}

export async function updateFileRemark(
  id: number,
  input: { manual_suggestion?: string | null; push_to_messages?: boolean },
) {
  const { data } = await api.patch<ProjectFile>(`/files/${id}/remark`, input)
  return data
}

export async function getSuggestionHistory(fileId: number) {
  const { data } = await api.get<FileSuggestionHistoryEntry[]>(`/files/${fileId}/suggestion-history`)
  return data
}
