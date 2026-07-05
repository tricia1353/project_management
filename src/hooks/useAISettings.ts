import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as aiApi from '@/api/aiSettings'
import type { AISettings } from '@/types'

export function useAISettings() {
  return useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.getAISettings,
  })
}

export function useSaveAISettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: aiApi.saveAISettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useTestAISettings() {
  return useMutation({
    mutationFn: (input?: Partial<AISettings>) => aiApi.testAISettings(input),
  })
}
