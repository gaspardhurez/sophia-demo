import { useQuery } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { LearningOverview } from '../model/types'

export const learningKeys = {
  root: ['learning'] as const,
  overview: ['learning', 'overview'] as const,
}

/**
 * La vue d'ensemble de l'apprentissage (#152) : ce qui est à faire, en six
 * cartes, et les savoirs en cours. Calculée par le serveur ; elle dépend de
 * tout (séances, cycles, pièces, projets), c'est pourquoi toute écriture
 * réussie l'invalide (`app/query-client.ts`) plutôt que chaque mutation une
 * à une.
 */
export function useLearningOverview() {
  return useQuery({
    queryKey: learningKeys.overview,
    queryFn: async (): Promise<LearningOverview> => {
      const { data, error, response } = await api.GET('/learning/overview')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}
