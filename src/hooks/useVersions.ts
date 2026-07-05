import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as versionsApi from '@/api/versions'

export function useVersions(fileId: number) {
  return useQuery({
    queryKey: ['versions', fileId],
    queryFn: () => versionsApi.getVersions(fileId),
    enabled: !!fileId,
  })
}

export function useVersionContent(versionId: number | null) {
  return useQuery({
    queryKey: ['version-content', versionId],
    queryFn: () => versionsApi.getVersionContent(versionId!),
    enabled: !!versionId,
  })
}

export function useRestoreVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: versionsApi.restoreVersion,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['file'] })
      qc.invalidateQueries({ queryKey: ['versions'] })
    },
  })
}
