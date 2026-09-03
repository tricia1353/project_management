import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as foldersApi from '@/api/folders'
import type { Folder, FolderType } from '@/types'

export function useFolders(params?: { folder_type?: FolderType }) {
  return useQuery({
    queryKey: ['folders', params?.folder_type],
    queryFn: () => foldersApi.getFolders(params),
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: foldersApi.createFolder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  })
}

export function useUpdateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<{ absolute_path: string; scan_interval_seconds: number; enabled: boolean; folder_type: FolderType }> }) =>
      foldersApi.updateFolder(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: foldersApi.deleteFolder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  })
}

export function useScanFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: foldersApi.scanFolder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['scans'] })
    },
  })
}

export function useScans(folderId: number | null) {
  return useQuery({
    queryKey: ['scans', folderId],
    queryFn: () => foldersApi.getScans(folderId!),
    enabled: !!folderId,
  })
}
