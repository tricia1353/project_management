import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as messagesApi from '@/api/messages'

export function useMessages(status: 'active' | 'unread' | 'all' = 'active') {
  return useQuery({
    queryKey: ['messages', status],
    queryFn: () => messagesApi.getMessages({ status }),
    refetchInterval: 30_000,
  })
}

export function useUnreadMessageCount() {
  return useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: messagesApi.getUnreadMessageCount,
    refetchInterval: 30_000,
  })
}

function invalidateMessages(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['messages'] })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['project-events'] })
}

export function useMarkMessageRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: messagesApi.markMessageRead,
    onSuccess: () => invalidateMessages(qc),
  })
}

export function useDismissMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: messagesApi.dismissMessage,
    onSuccess: () => invalidateMessages(qc),
  })
}

export function useArchiveMessageProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: messagesApi.archiveMessageProject,
    onSuccess: () => invalidateMessages(qc),
  })
}

export function useAddMessageProjectEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => messagesApi.addMessageProjectEvent(id, body),
    onSuccess: () => invalidateMessages(qc),
  })
}

export function useRemindMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remindAt }: { id: number; remindAt: string }) => messagesApi.remindMessage(id, remindAt),
    onSuccess: () => invalidateMessages(qc),
  })
}

export function useAnalyzeProjectHealth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: messagesApi.analyzeProjectHealth,
    onSuccess: () => invalidateMessages(qc),
  })
}
