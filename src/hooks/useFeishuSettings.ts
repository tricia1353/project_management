import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as feishuApi from '@/api/feishu'
import type { FeishuSettings } from '@/types'

export function useFeishuSettings() {
  return useQuery({
    queryKey: ['feishu-settings'],
    queryFn: feishuApi.getFeishuSettings,
  })
}

export function useSaveFeishuSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: feishuApi.saveFeishuSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feishu-settings'] }),
  })
}

export function useTestFeishuSettings() {
  return useMutation({
    mutationFn: (input?: Partial<FeishuSettings>) => feishuApi.testFeishuSettings(input),
  })
}
