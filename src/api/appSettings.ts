import { api } from './client'
import type { ProjectStatusSettings } from '@/types'

export async function getProjectStatusSettings() {
  const { data } = await api.get<ProjectStatusSettings>('/settings/project-status')
  return data
}

export async function saveProjectStatusSettings(input: ProjectStatusSettings) {
  const { data } = await api.put<ProjectStatusSettings>('/settings/project-status', input)
  return data
}
