import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as filesApi from '@/api/files'
import type { KanbanStatus } from '@/types'

export function useFiles(params: {
  folderId?: number | null
  search?: string
  extension?: string
  includeDeleted?: boolean
  processingStatus?: 'pending' | 'archived' | 'ignored' | 'all'
  scanId?: number | null
  latestScan?: boolean
}) {
  return useQuery({
    queryKey: ['files', params],
    queryFn: () => filesApi.getFiles(params),
    refetchInterval: 30_000,
  })
}

export function useIgnoreFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: filesApi.ignoreFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  })
}

export function useRestoreFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: filesApi.restoreFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  })
}

export function useFile(id: number) {
  return useQuery({
    queryKey: ['file', id],
    queryFn: () => filesApi.getFile(id),
    enabled: !!id,
  })
}

export function useUpdateFileStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: KanbanStatus }) =>
      filesApi.updateFileStatus(id, status),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['file', id] })
    },
  })
}

export function useUpdateFileRemark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      manual_suggestion,
      push_to_messages,
    }: {
      id: number
      manual_suggestion?: string | null
      push_to_messages?: boolean
    }) => filesApi.updateFileRemark(id, { manual_suggestion, push_to_messages }),
    onSuccess: (_, { id, push_to_messages }) => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['file', id] })
      qc.invalidateQueries({ queryKey: ['suggestion-history'] })
      if (push_to_messages) qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}

export function useSuggestionHistory(fileId: number) {
  return useQuery({
    queryKey: ['suggestion-history', fileId],
    queryFn: () => filesApi.getSuggestionHistory(fileId),
    enabled: !!fileId,
  })
}
