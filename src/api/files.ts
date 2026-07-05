import { api } from './client'
import type { KanbanStatus, ProjectFile } from '@/types'

export async function getFiles(params: {
  folderId?: number | null
  search?: string
  extension?: string
  status?: string
  includeDeleted?: boolean
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
