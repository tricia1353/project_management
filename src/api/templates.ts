import { api } from './client'

export interface ReportTemplate {
  id: number
  name: string
  content: string
  source_type: string
  original_filename: string | null
  is_default: number
  created_at: string
  updated_at: string
}

export async function getTemplates(): Promise<ReportTemplate[]> {
  const { data } = await api.get<ReportTemplate[]>('/templates')
  return data
}

export async function createTemplate(input: { name: string; content: string; is_default?: boolean }): Promise<ReportTemplate> {
  const { data } = await api.post<ReportTemplate>('/templates', input)
  return data
}

export async function importTemplate(file: File): Promise<ReportTemplate> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<ReportTemplate>('/templates/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function updateTemplate(id: number, input: { name?: string; content?: string; is_default?: boolean }): Promise<ReportTemplate> {
  const { data } = await api.patch<ReportTemplate>(`/templates/${id}`, input)
  return data
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/templates/${id}`)
}

export async function setDefaultTemplate(id: number): Promise<ReportTemplate> {
  const { data } = await api.post<ReportTemplate>(`/templates/${id}/set-default`)
  return data
}
