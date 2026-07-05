import { api } from './client'
import type { Folder, FolderType } from '@/types'

export async function getFolders(params?: { folder_type?: FolderType }) {
  const { data } = await api.get<Folder[]>('/folders', { params })
  return data
}

export async function createFolder(input: {
  absolute_path: string
  scan_interval_seconds: number
  enabled: boolean
  folder_type?: FolderType
}) {
  const { data } = await api.post<Folder>('/folders', input)
  return data
}

export async function updateFolder(id: number, input: Partial<{
  absolute_path: string
  scan_interval_seconds: number
  enabled: boolean
  folder_type: FolderType
}>) {
  const { data } = await api.patch<Folder>(`/folders/${id}`, input)
  return data
}

export async function deleteFolder(id: number) {
  const { data } = await api.delete<{ ok: boolean }>(`/folders/${id}`)
  return data
}

export async function scanFolder(id: number) {
  const { data } = await api.post(`/folders/${id}/scan`)
  return data
}
