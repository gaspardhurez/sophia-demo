import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { Unit, UnitCreate, UnitUpdate, UnitUsage } from '../model/types'

export const unitKeys = { root: ['units'] as const }

export function useUnits() {
  return useQuery({
    queryKey: unitKeys.root,
    queryFn: async (): Promise<Unit[]> => {
      const { data, error, response } = await api.GET('/units')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/**
 * Invalide les unités **et** ce qui les affiche : activités types et projets
 * embarquent l'unité résolue dans leur lecture.
 */
function useUnitMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: unitKeys.root })
    queryClient.invalidateQueries({ queryKey: ['activity-types'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    // Supprimer ou remplacer une unité touche aussi les valeurs déclarées et
    // les métriques (24/09/2026).
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    queryClient.invalidateQueries({ queryKey: ['metrics'] })
  }
}

export function useCreateUnit() {
  const onSuccess = useUnitMutationSuccess()
  return useMutation({
    mutationFn: async (body: UnitCreate): Promise<Unit> => {
      const { data, error, response } = await api.POST('/units', { body })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdateUnit() {
  const onSuccess = useUnitMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: UnitUpdate
    }): Promise<Unit> => {
      const { data, error, response } = await api.PATCH('/units/{unit_id}', {
        params: { path: { unit_id: id } },
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeleteUnit() {
  const onSuccess = useUnitMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      replaceBy,
    }: {
      id: string
      /** Bascule d'abord tout ce qui l'emploie vers cette unité. */
      replaceBy?: string
    }): Promise<void> => {
      const { error, response } = await api.DELETE('/units/{unit_id}', {
        params: {
          path: { unit_id: id },
          query: replaceBy ? { replace_by: replaceBy } : {},
        },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/** Ce qu'emploie cette unité : Totaux, valeurs déclarées, métriques, activités types. */
export function useUnitUsage(unitId: string | null) {
  return useQuery({
    queryKey: ['units', unitId, 'usage'],
    enabled: Boolean(unitId),
    staleTime: 0,
    queryFn: async (): Promise<UnitUsage> => {
      const { data, error, response } = await api.GET(
        '/units/{unit_id}/usage',
        {
          params: { path: { unit_id: unitId! } },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}
