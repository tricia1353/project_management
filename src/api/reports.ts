import { api } from './client'

export interface GenerateReportParams {
  startDate: string // 'YYYY-MM-DD'
  endDate: string
  folderIds?: number[]
}

export interface GenerateReportResult {
  markdown: string
}

export async function generateReport(params: GenerateReportParams) {
  const { data } = await api.post<GenerateReportResult>('/reports/generate', params)
  return data
}
