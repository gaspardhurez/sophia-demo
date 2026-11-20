import { useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, api, toApiError } from '@/shared/api'

import type {
  IntentionExchange,
  IntentionReply,
  ResourceProposal,
  ScopeTagProposal,
} from '../model/types'

/**
 * Un 503 dit que le compagnon n'est plus disponible : son état se relit
 * (clé écrite à plat, comme les autres clés étrangères de ce slice), et
 * l'écran repasse « à la main » avec le motif.
 */
function useOnFramingError() {
  const queryClient = useQueryClient()
  return (error: Error) => {
    if (error instanceof ApiError && error.status === 503)
      queryClient.invalidateQueries({ queryKey: ['companion'] })
  }
}

/**
 * « Cadrer l'étude » (#175), temps 1 : le tour suivant du chat de
 * l'intention (`POST /plans/{id}/framing/intention`). Sans échange, la
 * question d'ouverture et ses réponses proposées ; ensuite l'intention
 * reformulée et la question suivante, ou la fin (`done`).
 *
 * Une mutation, comme les autres appels du compagnon : chacun coûte un
 * passage du modèle, et **rien n'est enregistré** — l'intention s'écrit par
 * `useUpdatePlan` quand on la formule.
 */
export function useFramingIntention(planId: string) {
  const onError = useOnFramingError()
  return useMutation({
    mutationFn: async (body: {
      turns: IntentionExchange[]
      intention: string | null
    }): Promise<IntentionReply> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/framing/intention',
        { params: { path: { plan_id: planId } }, body },
      )
      if (error || !data) throw toApiError(error, response)
      return data
    },
    onError,
  })
}

/**
 * Temps 2 : les parties possibles du savoir, dans ou hors de ce cycle
 * (`POST /plans/{id}/framing/scope`), d'après l'intention de l'écran (nulle :
 * celle du cycle). Rien n'est enregistré.
 */
export function useFramingScope(planId: string) {
  const onError = useOnFramingError()
  return useMutation({
    mutationFn: async (
      intention: string | null,
    ): Promise<ScopeTagProposal[]> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/framing/scope',
        { params: { path: { plan_id: planId } }, body: { intention } },
      )
      if (error || !data) throw toApiError(error, response)
      return data.tags
    },
    onError,
  })
}

/**
 * Temps 3 : des ressources tirées d'une vraie recherche web
 * (`POST /plans/{id}/framing/resources`) — 8 au plus, dans l'ordre de
 * consommation conseillé ; aucune : rien de solide. `preferences` nulles :
 * celles gardées au domaine ; `exclude` : les liens à ne pas reproposer (le
 * serveur y ajoute ceux du cycle). Rien n'est enregistré.
 */
export function useFramingResources(planId: string) {
  const onError = useOnFramingError()
  return useMutation({
    mutationFn: async (body: {
      preferences: string | null
      exclude: string[]
    }): Promise<ResourceProposal[]> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/framing/resources',
        { params: { path: { plan_id: planId } }, body },
      )
      if (error || !data) throw toApiError(error, response)
      return data.resources
    },
    onError,
  })
}
