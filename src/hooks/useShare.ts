import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as shareApi from '@/api/share'

export function useProjectShare(projectId: number | null) {
  return useQuery({
    queryKey: ['project-share', projectId],
    queryFn: () => shareApi.getProjectShare(projectId!),
    enabled: !!projectId,
  })
}

export function useUpdateProjectShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: number; input: { enabled: boolean; assignmentIds: number[] } }) =>
      shareApi.updateProjectShare(projectId, input),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-share', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useResetProjectShareToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: shareApi.resetProjectShareToken,
    onSuccess: (_, projectId) => qc.invalidateQueries({ queryKey: ['project-share', projectId] }),
  })
}

export function usePublicShare(token: string | null) {
  return useQuery({
    queryKey: ['public-share', token],
    queryFn: () => shareApi.getPublicShare(token!),
    enabled: !!token,
  })
}
