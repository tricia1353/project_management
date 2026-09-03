import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as versionsApi from '@/api/versions'

export function useVersions(fileId: number) {
  return useQuery({
    queryKey: ['versions', fileId],
    queryFn: () => versionsApi.getVersions(fileId),
    enabled: !!fileId,
    refetchInterval: 10_000,
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

export function useVersionGroupCandidates(fileId: number) {
  return useQuery({
    queryKey: ['version-group-candidates', fileId],
    queryFn: () => versionsApi.getVersionGroupCandidates(fileId),
    enabled: !!fileId,
  })
}

export function useMergeVersionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fileId, targetFileId }: { fileId: number; targetFileId: number }) =>
      versionsApi.mergeVersionGroup(fileId, targetFileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions'] })
      qc.invalidateQueries({ queryKey: ['file'] })
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['version-group-candidates'] })
    },
  })
}

export function useSplitVersionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fileId: number) => versionsApi.splitVersionGroup(fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions'] })
      qc.invalidateQueries({ queryKey: ['file'] })
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['version-group-candidates'] })
    },
  })
}
