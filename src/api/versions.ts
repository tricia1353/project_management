import { api } from './client'
import type { FileVersion, VersionContent } from '@/types'

export async function getVersions(fileId: number) {
  const { data } = await api.get<FileVersion[]>(`/files/${fileId}/versions`)
  return data
}

export async function getVersionContent(versionId: number) {
  const { data } = await api.get<VersionContent>(`/versions/${versionId}/content`)
  return data
}

export async function restoreVersion(versionId: number) {
  const { data } = await api.post(`/versions/${versionId}/restore`)
  return data
}
