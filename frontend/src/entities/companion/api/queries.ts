import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api, toApiError } from '@/shared/api'

import type { CentralIdea, CompanionStatus, Dictation } from '../model/types'

export const companionKeys = {
  status: ['companion'] as const,
}

/**
 * L'état du compagnon (`GET /companion`) : ce qui permet à l'écran de
 * **griser** une action de Sophia et de dire pourquoi, plutôt que de la
 * cacher (#173). Il ne change qu'au redémarrage du serveur (clé posée,
 * transcription installée) : pas de relecture d'office, mais un 503 reçu en
 * cours de route le relit (`useCleanDictation`).
 */
export function useCompanionStatus() {
  return useQuery({
    queryKey: companionKeys.status,
    queryFn: async (): Promise<CompanionStatus> => {
      const { data, error, response } = await api.GET('/companion')
      if (error) throw toApiError(error, response)
      return data
    },
    staleTime: Infinity,
  })
}

/**
 * Nettoyer une dictée (`POST /skills/{id}/dictation`) : le texte que la
 * transcription en direct a validé part au LLM, qui rend des **puces** —
 * sans rien écrire : c'est l'écran qui les pose au curseur. `resourceId` :
 * la ressource dont on dicte les notes (son titre aide le nettoyage), nul
 * dans les notes du savoir.
 *
 * Un 503 dit que la dictée n'est plus disponible : l'état du compagnon se
 * relit, et le bouton se grise avec son motif.
 */
export function useCleanDictation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      skillId,
      resourceId,
      transcript,
    }: {
      skillId: string
      resourceId: string | null
      transcript: string
    }): Promise<Dictation> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/dictation',
        {
          params: { path: { skill_id: skillId } },
          body: { transcript, resource_id: resourceId },
        },
      )
      if (error || !data) throw toApiError(error, response)
      return data
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 503)
        queryClient.invalidateQueries({ queryKey: companionKeys.status })
    },
  })
}

/**
 * Les idées centrales d'**une** section des notes (« Préparer les
 * questions », « 🧠 Suggestions », #173) : la section part en fragment de
 * document (`{type: 'doc', content}` — ses nœuds de premier rang, son titre
 * compris, tels que l'écran les découpe) ; le serveur rend trois idées au
 * plus, aucune s'il n'y a rien à ajouter aux questions. **Rien n'est
 * enregistré** : c'est l'écran qui garde le résultat, le temps de la visite.
 *
 * Une mutation, pas une requête : chaque appel coûte un passage du modèle et
 * ne part que quand l'écran le décide. Un 503 relit l'état du compagnon :
 * l'interrupteur se grise avec son motif.
 */
export function useCentralIdeas(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      section: Record<string, unknown>,
    ): Promise<CentralIdea[]> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/central-ideas',
        { params: { path: { skill_id: skillId } }, body: { section } },
      )
      if (error || !data) throw toApiError(error, response)
      return data.ideas
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 503)
        queryClient.invalidateQueries({ queryKey: companionKeys.status })
    },
  })
}
