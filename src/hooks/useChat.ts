import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as chatApi from '@/api/chat'

export function useChatSessions() {
  return useQuery({
    queryKey: ['chat-sessions'],
    queryFn: chatApi.getChatSessions,
  })
}

export function useCreateChatSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: chatApi.createChatSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-sessions'] }),
  })
}

export function useDeleteChatSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: chatApi.deleteChatSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-sessions'] }),
  })
}

export function useChatMessages(sessionId: number | null) {
  return useQuery({
    queryKey: ['chat-messages', sessionId],
    queryFn: () => chatApi.getChatMessages(sessionId!),
    enabled: !!sessionId,
  })
}

export function useInvalidateChatMessages() {
  const qc = useQueryClient()
  return (sessionId: number) => {
    qc.invalidateQueries({ queryKey: ['chat-messages', sessionId] })
    qc.invalidateQueries({ queryKey: ['chat-sessions'] })
  }
}
