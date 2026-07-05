import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as filesApi from '@/api/files'
import type { KanbanStatus } from '@/types'

export function useFiles(params: {
  folderId?: number | null
  search?: string
  extension?: string
  includeDeleted?: boolean
}) {
  return useQuery({
    queryKey: ['files', params],
    queryFn: () => filesApi.getFiles(params),
    refetchInterval: 30_000,
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
