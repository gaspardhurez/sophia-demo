import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  Resource,
  ResourceCreate,
  ResourceNotes,
  ResourceUpdate,
} from '../model/types'

export const resourceKeys = {
  root: ['resources'] as const,
  list: (skillId: string) => ['resources', skillId] as const,
  // Hors de `root` : relire les listes ne relit pas un document en cours
  // d'écriture.
  notes: (resourceId: string) => ['resource-notes', resourceId] as const,
}

/** Les ressources d'un savoir, dans l'ordre où elles ont été repérées. */
export function useResources(skillId: string | undefined) {
  return useQuery({
    queryKey: resourceKeys.list(skillId ?? ''),
    queryFn: async (): Promise<Resource[]> => {
      const { data, error, response } = await api.GET(
        '/skills/{skill_id}/resources',
        { params: { path: { skill_id: skillId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(skillId),
  })
}

/**
 * Repérer une ressource. Créée depuis un cycle (`plan_id`), elle y entre
 * aussi : les cycles se relisent (clé écrite à plat, comme ailleurs : deux
 * slices ne s'importent pas).
 */
export function useCreateResource(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ResourceCreate): Promise<Resource> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/resources',
        { params: { path: { skill_id: skillId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (_data, body) => {
      queryClient.invalidateQueries({ queryKey: resourceKeys.list(skillId) })
      if (body.plan_id) queryClient.invalidateQueries({ queryKey: ['plans'] })
    },
  })
}

/** Modifier une ressource : titre, lien ou référence, partie. */
export function useUpdateResource(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: ResourceUpdate
    }): Promise<Resource> => {
      const { data, error, response } = await api.PATCH(
        '/resources/{resource_id}',
        { params: { path: { resource_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: resourceKeys.list(skillId) }),
  })
}

/**
 * Supprimer une ressource : elle quitte la bibliothèque du savoir et les
 * cycles qui l'étudiaient — ceux-ci se relisent.
 */
export function useDeleteResource(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await api.DELETE('/resources/{resource_id}', {
        params: { path: { resource_id: id } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceKeys.list(skillId) })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
    },
  })
}

async function fetchResourceNotes(resourceId: string): Promise<ResourceNotes> {
  const { data, error, response } = await api.GET(
    '/resources/{resource_id}/notes',
    { params: { path: { resource_id: resourceId } } },
  )
  if (error) throw toApiError(error, response)
  return data
}

/** Les notes libres d'une ressource (#173) : `{ doc }`, nul sans écrit. */
export function useResourceNotes(resourceId: string | undefined) {
  return useQuery({
    queryKey: resourceKeys.notes(resourceId ?? ''),
    queryFn: () => fetchResourceNotes(resourceId as string),
    enabled: Boolean(resourceId),
  })
}

/**
 * Les notes de plusieurs ressources, dans l'ordre des ids (`undefined` tant
 * qu'elles ne sont pas lues) — pour savoir **lesquelles portent du texte** :
 * « Vérifier les notes », dans la colonne, vise une ressource qui en a. Même
 * cache que `useResourceNotes` : l'enregistrement d'une ressource ouverte y
 * écrit, la liste suit.
 */
export function useResourcesNotes(resourceIds: string[]) {
  return useQueries({
    queries: resourceIds.map((id) => ({
      queryKey: resourceKeys.notes(id),
      queryFn: () => fetchResourceNotes(id),
    })),
    combine: (results) => results.map((r) => r.data),
  })
}

/**
 * Enregistre les notes d'une ressource d'un bloc : le document entier
 * remplace l'ancien. Le cache prend la réponse — rouvrir la ressource repart
 * de ce qui vient de partir.
 */
export function useSaveResourceNotes(resourceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      doc: Record<string, unknown>,
    ): Promise<ResourceNotes> => {
      const { data, error, response } = await api.PUT(
        '/resources/{resource_id}/notes',
        { params: { path: { resource_id: resourceId } }, body: { doc } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (data) =>
      queryClient.setQueryData(resourceKeys.notes(resourceId), data),
  })
}

/** Ce qu'on lit à la page d'un lien : son titre, et son auteur (une
 *  personne, sinon le site — retiré de la fin du titre) ; `null` pour ce qui
 *  manque. */
export interface LinkInfo {
  title: string | null
  author: string | null
}

/**
 * Le titre et l'auteur de la page d'un lien, lus par le serveur (le
 * navigateur ne lit pas la page d'un autre site) : pour pré-remplir une
 * nouvelle ressource. `null` : rien à lire. `paste` : chaque collage relit la
 * page, même pour un lien déjà lu.
 */
export function useLinkTitle(url: string | null, paste = 0) {
  return useQuery({
    ...linkTitleQuery(url ?? '', paste),
    enabled: Boolean(url),
  })
}

/**
 * La même lecture, en options de requête : pour la lire d'un coup
 * (`queryClient.fetchQuery`) au moment d'ajouter un lien — « Cadrer
 * l'étude » montre « Lecture… » pendant ce temps.
 */
export function linkTitleQuery(url: string, paste = 0) {
  return {
    queryKey: ['link-title', url, paste],
    queryFn: async (): Promise<LinkInfo> => {
      const { data, error, response } = await api.GET('/link-title', {
        params: { query: { url } },
      })
      if (error) throw toApiError(error, response)
      return { title: data.title ?? null, author: data.author ?? null }
    },
    staleTime: Infinity,
    retry: false,
  }
}
