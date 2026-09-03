import { api } from './client'
import type { FileVersion, VersionContent, VersionGroupCandidate, ProjectFile } from '@/types'

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

export async function getVersionGroupCandidates(fileId: number) {
  const { data } = await api.get<VersionGroupCandidate[]>(`/files/${fileId}/version-group/candidates`)
  return data
}

export async function mergeVersionGroup(fileId: number, targetFileId: number) {
  const { data } = await api.post<ProjectFile>(`/files/${fileId}/version-group/merge`, { target_file_id: targetFileId })
  return data
}

export async function splitVersionGroup(fileId: number) {
  const { data } = await api.post<ProjectFile>(`/files/${fileId}/version-group/split`)
  return data
}
