import { api } from './client'
import type { ProjectShare, PublicSharePayload } from '@/types'

export async function getProjectShare(projectId: number) {
  const { data } = await api.get<ProjectShare>(`/projects/${projectId}/share`)
  return data
}

export async function updateProjectShare(projectId: number, input: { enabled: boolean; assignmentIds: number[] }) {
  const { data } = await api.put<ProjectShare>(`/projects/${projectId}/share`, input)
  return data
}

export async function resetProjectShareToken(projectId: number) {
  const { data } = await api.post<ProjectShare>(`/projects/${projectId}/share/reset-token`)
  return data
}

export async function getPublicShare(token: string) {
  const { data } = await api.get<PublicSharePayload>(`/share/${token}`)
  return data
}
