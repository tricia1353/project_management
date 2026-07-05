import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as projectsApi from '@/api/projects'

export function useProjects(params?: { folderId?: number | null; status?: 'active' | 'archived'; includeCompleted?: boolean }) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getProjects(params),
  })
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getProject(id!),
    enabled: !!id,
  })
}

export function useProjectAssignments(projectId: number) {
  return useQuery({
    queryKey: ['assignments', projectId],
    queryFn: () => projectsApi.getProjectAssignments(projectId),
    enabled: !!projectId,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: projectsApi.createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: { name?: string; status?: 'active' | 'archived'; kanban_status?: import('@/types').KanbanStatus } }) =>
      projectsApi.updateProject(id, input),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: projectsApi.deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useAssignFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, fileId }: { projectId: number; fileId: number }) =>
      projectsApi.assignFile(projectId, fileId),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['assignments', projectId] })
    },
  })
}

export function useFinalizeProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: projectsApi.finalizeProject,
    onSuccess: (_, projectId) => qc.invalidateQueries({ queryKey: ['assignments', projectId] }),
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: projectsApi.archiveProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUnarchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: projectsApi.unarchiveProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useProjectEvents(projectId: number | null) {
  return useQuery({
    queryKey: ['project-events', projectId],
    queryFn: () => projectsApi.getProjectEvents(projectId!),
    enabled: !!projectId,
  })
}

export function useAddProjectEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: number; body: string }) =>
      projectsApi.addProjectEvent(projectId, body),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-events', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useCompleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, scope }: { projectId: number; scope: 'current' | 'with_children' }) =>
      projectsApi.completeProject(projectId, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useRestoreProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, scope }: { projectId: number; scope?: 'current' | 'with_children' }) =>
      projectsApi.restoreProject(projectId, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
