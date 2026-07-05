import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as templatesApi from '@/api/templates'

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.getTemplates,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: templatesApi.createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useImportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: templatesApi.importTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: { name?: string; content?: string; is_default?: boolean } }) =>
      templatesApi.updateTemplate(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: templatesApi.deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useSetDefaultTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: templatesApi.setDefaultTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
