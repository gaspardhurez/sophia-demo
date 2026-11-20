import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { MetricValue, ProjectMetric } from '../model/types'

/**
 * Les Résultats de plusieurs projets à la fois — ceux d'une activité liée à
 * plusieurs projets (panneau d'activité, #44).
 *
 * Même clé que `useProjectMetrics`, projet par projet : le cache est
 * partagé avec la page projet, et les mutations qui l'invalident valent ici.
 */
export function useProjectsMetrics(projectIds: string[]) {
  return useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ['projects', id, 'metrics'],
      queryFn: async (): Promise<ProjectMetric[]> => {
        const { data, error, response } = await api.GET(
          '/projects/{project_id}/metrics',
          { params: { path: { project_id: id } } },
        )
        if (error) throw toApiError(error, response)
        return data
      },
    })),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
      isPending: results.some((r) => r.isPending),
    }),
  })
}

/**
 * Corriger la valeur d'un relevé — celui qu'une activité a pris, retapé dans
 * son panneau. La date reste celle du relevé.
 */
export function useUpdateMetricValue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      value,
    }: {
      id: string
      value: number
    }): Promise<MetricValue> => {
      const { data, error, response } = await api.PATCH(
        '/metric-values/{value_id}',
        { params: { path: { value_id: id } }, body: { value } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    // Comme toute mutation de relevé : la métrique, les projets qui la
    // visent, et les relevés de l'activité (sous la clé `activities`).
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}
