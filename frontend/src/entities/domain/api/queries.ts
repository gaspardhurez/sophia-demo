import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  Domain,
  DomainCounter,
  DomainCreate,
  DomainUpdate,
  DomainUsage,
} from '../model/types'

export const domainKeys = {
  all: ['domains'] as const,
  detail: (id: string) => ['domains', id] as const,
}

export function useDomains() {
  return useQuery({
    queryKey: domainKeys.all,
    queryFn: async (): Promise<Domain[]> => {
      const { data, error, response } = await api.GET('/domains')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/** Ces domaines, dans l'ordre donné — ceux d'un projet, le principal en
 *  tête (#203). Un id inconnu est sauté. */
export function useDomainsOf(ids: string[]): Domain[] {
  const { data } = useDomains()
  return ids.flatMap((id) => data?.find((d) => d.id === id) ?? [])
}

export function useDomain(id: string | undefined) {
  return useQuery({
    queryKey: domainKeys.detail(id ?? ''),
    queryFn: async (): Promise<Domain> => {
      const { data, error, response } = await api.GET('/domains/{domain_id}', {
        params: { path: { domain_id: id as string } },
      })
      if (error) throw toApiError(error, response)
      return data
    },
    // Tant qu'on n'a pas d'id (param d'URL pas encore lu), on ne requête pas.
    enabled: Boolean(id),
  })
}

/** Ce que la suppression du domaine emporterait — lu à l'ouverture de la
 *  modale (`domainId` nul = pas de requête). */
export function useDomainUsage(domainId: string | null) {
  return useQuery({
    queryKey: ['domains', domainId, 'usage'],
    enabled: Boolean(domainId),
    // Le décompte doit refléter l'état réel au moment où on pose la question.
    staleTime: 0,
    queryFn: async (): Promise<DomainUsage> => {
      const { data, error, response } = await api.GET(
        '/domains/{domain_id}/usage',
        { params: { path: { domain_id: domainId! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

export function useCreateDomain() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: DomainCreate): Promise<Domain> => {
      const { data, error, response } = await api.POST('/domains', { body })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: domainKeys.all }),
  })
}

export function useUpdateDomain() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: DomainUpdate
    }): Promise<Domain> => {
      const { data, error, response } = await api.PATCH(
        '/domains/{domain_id}',
        {
          params: { path: { domain_id: id } },
          body,
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (domain) => {
      queryClient.invalidateQueries({ queryKey: domainKeys.all })
      queryClient.setQueryData(domainKeys.detail(domain.id), domain)
    },
  })
}

export function useDeleteDomain() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await api.DELETE('/domains/{domain_id}', {
        params: { path: { domain_id: id } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess: (_result, id) => {
      // La ressource n'existe plus : on retire son entrée du cache. L'invalider
      // déclencherait un GET sur un domaine supprimé, donc un 404 garanti.
      queryClient.removeQueries({ queryKey: domainKeys.detail(id) })
      // `exact` pour ne toucher que la liste : sans lui, le préfixe ['domains']
      // rattraperait aussi les entrées de détail.
      return queryClient.invalidateQueries({
        queryKey: domainKeys.all,
        exact: true,
      })
    },
  })
}

/**
 * Les compteurs du domaine — heures et unités déclarées, depuis toujours.
 *
 * Rangés sous la clé `activities` : ils se lisent sur les activités faites, et
 * toute mutation d'activité (ou d'unité) invalide déjà cette racine.
 */
export function useDomainCounters(domainId: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'domain-counters', domainId ?? null],
    enabled: Boolean(domainId),
    queryFn: async (): Promise<DomainCounter[]> => {
      const { data, error, response } = await api.GET(
        '/domains/{domain_id}/counters',
        { params: { path: { domain_id: domainId! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}
