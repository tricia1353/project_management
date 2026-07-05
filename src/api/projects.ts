import { api } from './client'
import type { FileAssignment, KanbanStatus, Project, ProjectEvent } from '@/types'

export async function getProjects(params?: { folderId?: number | null; status?: 'active' | 'archived'; includeCompleted?: boolean }) {
  const { data } = await api.get<Project[]>('/projects', { params })
  return data
}

export async function getProject(id: number) {
  const { data } = await api.get<Project>(`/projects/${id}`)
  return data
}

export async function createProject(input: { folder_id: number; path: string; name?: string }) {
  const { data } = await api.post<Project>('/projects', input)
  return data
}

export async function updateProject(id: number, input: { name?: string; status?: 'active' | 'archived'; kanban_status?: KanbanStatus }) {
  const { data } = await api.patch<Project>(`/projects/${id}`, input)
  return data
}

export async function deleteProject(id: number) {
  const { data } = await api.delete<{ ok: boolean }>(`/projects/${id}`)
  return data
}

export async function getProjectAssignments(projectId: number) {
  const { data } = await api.get<FileAssignment[]>(`/projects/${projectId}/assignments`)
  return data
}

export async function assignFile(projectId: number, fileId: number) {
  const { data } = await api.post<{ id: number; dest_filename: string; dest_path: string }>(
    `/projects/${projectId}/assign`,
    { fileId },
  )
  return data
}

export async function finalizeProject(projectId: number) {
  const { data } = await api.post<{ moved: string[] }>(`/projects/${projectId}/finalize`)
  return data
}

export async function archiveProject(projectId: number) {
  const { data } = await api.post<{ ok: boolean }>(`/projects/${projectId}/archive`)
  return data
}

export async function unarchiveProject(projectId: number) {
  const { data } = await api.post<{ ok: boolean }>(`/projects/${projectId}/unarchive`)
  return data
}

export async function getProjectEvents(projectId: number) {
  const { data } = await api.get<ProjectEvent[]>(`/projects/${projectId}/events`)
  return data
}

export async function addProjectEvent(projectId: number, body: string) {
  const { data } = await api.post<ProjectEvent>(`/projects/${projectId}/events`, { body })
  return data
}

export async function completeProject(projectId: number, scope: 'current' | 'with_children') {
  const { data } = await api.post<{ ok: boolean; affected_count: number }>(`/projects/${projectId}/complete`, { scope })
  return data
}

export async function restoreProject(projectId: number, scope: 'current' | 'with_children' = 'current') {
  const { data } = await api.post<{ ok: boolean; affected_count: number }>(`/projects/${projectId}/restore`, { scope })
  return data
}
