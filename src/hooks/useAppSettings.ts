import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as appSettingsApi from '@/api/appSettings'

export function useProjectStatusSettings() {
  return useQuery({
    queryKey: ['project-status-settings'],
    queryFn: appSettingsApi.getProjectStatusSettings,
  })
}

export function useSaveProjectStatusSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: appSettingsApi.saveProjectStatusSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-status-settings'] }),
  })
}
