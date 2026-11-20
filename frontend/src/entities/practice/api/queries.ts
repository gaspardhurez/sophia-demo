import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  PracticeItem,
  PracticeItemCreate,
  PracticeItemUpdate,
} from '../model/types'

export const practiceKeys = {
  root: ['practice'] as const,
  list: (skillId: string) => ['practice', 'list', skillId] as const,
}

/** La bibliothèque d'un savoir — les deux natures ensemble. */
export function usePracticeItems(skillId: string | undefined) {
  return useQuery({
    queryKey: practiceKeys.list(skillId ?? ''),
    queryFn: async (): Promise<PracticeItem[]> => {
      const { data, error, response } = await api.GET(
        '/skills/{skill_id}/practice',
        { params: { path: { skill_id: skillId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(skillId),
  })
}

/**
 * Invalide le catalogue **et** les activités : `sessions` est dérivé des
 * activités faites, donc cocher une séance déplace un compteur du catalogue.
 *
 * Et les cycles : créer un objet dans un cycle l'ajoute à sa rampe, le
 * supprimer l'ôte de toutes. Clés écrites à plat, comme dans
 * `entities/plan` : deux slices ne s'importent pas.
 */
function usePracticeMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: practiceKeys.root })
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    queryClient.invalidateQueries({ queryKey: ['skills'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
}

export function useCreatePracticeItem() {
  const onSuccess = usePracticeMutationSuccess()

  return useMutation({
    mutationFn: async ({
      skillId,
      body,
    }: {
      skillId: string
      body: PracticeItemCreate
    }): Promise<PracticeItem> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/practice',
        { params: { path: { skill_id: skillId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdatePracticeItem() {
  const onSuccess = usePracticeMutationSuccess()

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: PracticeItemUpdate
    }): Promise<PracticeItem> => {
      const { data, error, response } = await api.PATCH('/practice/{item_id}', {
        params: { path: { item_id: id } },
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeletePracticeItem() {
  const onSuccess = usePracticeMutationSuccess()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await api.DELETE('/practice/{item_id}', {
        params: { path: { item_id: id } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}
