import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { Ghost, PlanningLevel } from '../model/types'

const planningKeys = {
  root: ['planning'] as const,
}

/** Jusqu'où le calendrier est posé (`posed_until`, `null` : rien de préparé). */
export function usePlanningLevel() {
  return useQuery({
    queryKey: [...planningKeys.root, 'level'],
    queryFn: async (): Promise<PlanningLevel> => {
      const { data, error, response } = await api.GET('/planning/level')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/**
 * Préparer : poser jusqu'à `until`, ou la semaine en cours sans date — ce
 * qu'appelle l'app à son ouverture. Idempotent côté serveur.
 */
export function usePreparePlanning() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (until?: string): Promise<PlanningLevel> => {
      const { data, error, response } = await api.POST('/planning/prepare', {
        body: { until: until ?? null },
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planningKeys.root })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

/** Les fantômes : ce que la planification poserait sur [start, end[ au-delà
 *  de ce qui est posé, sans rien écrire. */
export function usePlanningPreview(
  start: string,
  end: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...planningKeys.root, 'preview', start, end],
    enabled,
    queryFn: async (): Promise<Ghost[]> => {
      const { data, error, response } = await api.GET('/planning/preview', {
        params: { query: { start, end } },
      })
      if (error) throw toApiError(error, response)
      return data
    },
  })
}
