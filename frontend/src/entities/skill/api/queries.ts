import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { Skill, SkillCreate, SkillUpdate } from '../model/types'

export const skillKeys = {
  // Racine invalidée par les mutations : une compétence peut appartenir à
  // plusieurs domaines, donc une modif peut toucher plusieurs vues.
  root: ['skills'] as const,
  list: (domainId: string) => ['skills', 'list', domainId] as const,
  all: ['skills', 'all'] as const,
  detail: (id: string) => ['skills', 'detail', id] as const,
}

/** Graphe global : toutes les compétences, tous domaines confondus. */
export function useAllSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: async (): Promise<Skill[]> => {
      const { data, error, response } = await api.GET('/skills')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/** Une compétence par son id — la page et le panneau lisent d'ici. */
export function useSkill(skillId: string | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(skillId ?? ''),
    queryFn: async (): Promise<Skill> => {
      const { data, error, response } = await api.GET('/skills/{skill_id}', {
        params: { path: { skill_id: skillId as string } },
      })
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(skillId),
  })
}

/** Liste plate des savoirs d'un domaine (le front reconstruit l'arbre). */
export function useSkills(domainId: string | undefined) {
  return useQuery({
    queryKey: skillKeys.list(domainId ?? ''),
    queryFn: async (): Promise<Skill[]> => {
      const { data, error, response } = await api.GET(
        '/domains/{domain_id}/skills',
        { params: { path: { domain_id: domainId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(domainId),
  })
}

/**
 * Les savoirs de plusieurs domaines, à la suite dans l'ordre des domaines —
 * ceux d'un projet (#203). `data` attend que tous soient là.
 */
export function useDomainsSkills(domainIds: string[]) {
  return useQueries({
    queries: domainIds.map((domainId) => ({
      queryKey: skillKeys.list(domainId),
      queryFn: async (): Promise<Skill[]> => {
        const { data, error, response } = await api.GET(
          '/domains/{domain_id}/skills',
          { params: { path: { domain_id: domainId } } },
        )
        if (error) throw toApiError(error, response)
        return data
      },
    })),
    combine: joinSkills,
  })
}

// Hors du hook : une référence stable, que TanStack ne recalcule que quand
// une des listes change.
function joinSkills(results: { data?: Skill[]; isLoading: boolean }[]) {
  return {
    data: results.every((r) => r.data)
      ? results.flatMap((r) => r.data ?? [])
      : undefined,
    isLoading: results.some((r) => r.isLoading),
  }
}

export function useCreateSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      domainId,
      body,
    }: {
      domainId: string
      body: SkillCreate
    }): Promise<Skill> => {
      const { data, error, response } = await api.POST(
        '/domains/{domain_id}/skills',
        { params: { path: { domain_id: domainId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: skillKeys.root }),
  })
}

export function useReparentSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      newParentId,
      index,
    }: {
      id: string
      newParentId: string | null
      /** Sa place parmi ses nouveaux frères ; absente, en dernier. */
      index?: number
    }): Promise<Skill> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/reparent',
        {
          params: { path: { skill_id: id } },
          body: { new_parent_id: newParentId, index: index ?? null },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: skillKeys.root }),
  })
}

export function useDeleteSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      children = 'delete',
    }: {
      id: string
      /** `lift` : ses enfants remontent à sa place au lieu de partir avec. */
      children?: 'delete' | 'lift'
    }): Promise<void> => {
      const { error, response } = await api.DELETE('/skills/{skill_id}', {
        params: { path: { skill_id: id }, query: { children } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.root })
      // Ses projets le perdent : leur séquence se resserre.
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: SkillUpdate
    }): Promise<Skill> => {
      const { data, error, response } = await api.PATCH('/skills/{skill_id}', {
        params: { path: { skill_id: id } },
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.root })
      // Ses projets recopient son nom : le plan doit le voir renommé.
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
