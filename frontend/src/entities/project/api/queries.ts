import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  Achievement,
  AchievementCreate,
  AchievementUpdate,
  Project,
  ProjectCounter,
  ProjectCreate,
  ProjectDomainTies,
  ProjectStepCreate,
  ProjectStepUpdate,
  ProjectUpdate,
  TotalCreate,
  TotalUpdate,
} from '../model/types'

export const projectKeys = {
  // Racine invalidée par toutes les mutations : rafraîchit liste par domaine
  // ET liste cross-domaine d'un coup.
  root: ['projects'] as const,
  list: (domainId: string) => ['projects', 'list', domainId] as const,
  all: ['projects', 'all'] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
}

export function useProjects(domainId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.list(domainId ?? ''),
    queryFn: async (): Promise<Project[]> => {
      const { data, error, response } = await api.GET(
        '/domains/{domain_id}/projects',
        { params: { path: { domain_id: domainId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(domainId),
  })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: async (): Promise<Project> => {
      const { data, error, response } = await api.GET(
        '/projects/{project_id}',
        { params: { path: { project_id: id as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(id),
  })
}

/**
 * Les compteurs du projet (#194). Sous la racine `projects` : les mutations
 * d'activité comme celles des Totaux l'invalident.
 */
export function useProjectCounters(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', 'counters', id ?? null],
    enabled: Boolean(id),
    queryFn: async (): Promise<ProjectCounter[]> => {
      const { data, error, response } = await api.GET(
        '/projects/{project_id}/counters',
        { params: { path: { project_id: id! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/** Tous les projets, tous domaines confondus — pour le hub du dashboard. */
export function useAllProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async (): Promise<Project[]> => {
      const { data, error, response } = await api.GET('/projects')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      domainId,
      body,
    }: {
      domainId: string
      body: ProjectCreate
    }): Promise<Project> => {
      const { data, error, response } = await api.POST(
        '/domains/{domain_id}/projects',
        { params: { path: { domain_id: domainId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: ProjectUpdate
    }): Promise<Project> => {
      const { data, error, response } = await api.PATCH(
        '/projects/{project_id}',
        { params: { path: { project_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useSetProjectSkills() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      skillIds,
    }: {
      id: string
      skillIds: string[]
    }): Promise<Project> => {
      const { data, error, response } = await api.PUT(
        '/projects/{project_id}/skills',
        {
          params: { path: { project_id: id } },
          body: { skill_ids: skillIds },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

/**
 * `discardPosed` : l'abandon d'une création retire aussi ce que ses liens ont
 * posé au calendrier sans qu'on y touche — le calendrier se relit alors.
 */
/**
 * Ses domaines, dans l'ordre : le premier est le principal (#203). Un domaine
 * retiré délie ce qui en venait — savoirs, activités types, Résultats, liens
 * d'activités : tout ce qui en dépend se relit.
 */
export function useSetProjectDomains() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      domainIds,
    }: {
      id: string
      domainIds: string[]
    }): Promise<Project> => {
      const { data, error, response } = await api.PUT(
        '/projects/{project_id}/domains',
        {
          params: { path: { project_id: id } },
          body: { domain_ids: domainIds },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.root })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

/** Ce que le projet perdrait si ce domaine le quittait — la confirmation
 *  l'énumère. Rien tant qu'aucun domaine n'est désigné. */
export function useProjectDomainTies(
  projectId: string | undefined,
  domainId: string | null,
) {
  return useQuery({
    queryKey: ['projects', 'ties', projectId, domainId],
    enabled: Boolean(projectId && domainId),
    queryFn: async (): Promise<ProjectDomainTies> => {
      const { data, error, response } = await api.GET(
        '/projects/{project_id}/domains/{domain_id}/ties',
        {
          params: {
            path: { project_id: projectId!, domain_id: domainId! },
          },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      discardPosed = false,
    }: {
      id: string
      discardPosed?: boolean
    }): Promise<void> => {
      const { error, response } = await api.DELETE('/projects/{project_id}', {
        params: {
          path: { project_id: id },
          query: discardPosed ? { discard_posed: true } : undefined,
        },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess: (_data, { discardPosed }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.root })
      if (discardPosed)
        queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

// --- Étapes -----------------------------------------------------------------
// Toutes les mutations d'étape renvoient le projet parent complet et invalident
// la racine des projets.

export function useCreateStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      body,
    }: {
      projectId: string
      body: ProjectStepCreate
    }): Promise<Project> => {
      const { data, error, response } = await api.POST(
        '/projects/{project_id}/steps',
        { params: { path: { project_id: projectId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useUpdateStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stepId,
      body,
    }: {
      stepId: string
      body: ProjectStepUpdate
    }): Promise<Project> => {
      const { data, error, response } = await api.PATCH('/steps/{step_id}', {
        params: { path: { step_id: stepId } },
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useSetStepSkills() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stepId,
      skillIds,
    }: {
      stepId: string
      skillIds: string[]
    }): Promise<Project> => {
      const { data, error, response } = await api.PUT(
        '/steps/{step_id}/skills',
        {
          params: { path: { step_id: stepId } },
          body: { skill_ids: skillIds },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useDeleteStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ stepId }: { stepId: string }): Promise<void> => {
      const { error, response } = await api.DELETE('/steps/{step_id}', {
        params: { path: { step_id: stepId } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useReorderSteps() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      stepIds,
    }: {
      projectId: string
      stepIds: string[]
    }): Promise<Project> => {
      const { data, error, response } = await api.PUT(
        '/projects/{project_id}/steps/order',
        {
          params: { path: { project_id: projectId } },
          body: { step_ids: stepIds },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

/** Un segment de la séquence : les savoirs d'une étape (ou à plat), dans l'ordre. */
export interface SequenceSegment {
  step_id: string | null
  skill_ids: string[]
}

/**
 * Écrit la séquence d'acquisition d'un bloc. Ce qu'elle ne range pas est hors
 * séquence. L'écran met la séquence à jour **avant** la réponse : un glisser
 * qui attend le serveur pour se poser se lit comme un raté.
 */
export function useSetProjectSequence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      segments,
    }: {
      projectId: string
      segments: SequenceSegment[]
    }): Promise<Project> => {
      const { data, error, response } = await api.PUT(
        '/projects/{project_id}/sequence',
        {
          params: { path: { project_id: projectId } },
          body: { segments },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

// --- Réalisations ----------------------------------------------------------
//
// Elles n'ont pas de lecture propre : elles voyagent avec le projet
// (`ProjectRead.achievements`). Seules les écritures ont un endpoint, et
// toutes invalident la racine — cocher une réalisation change le statut dérivé
// du projet, donc ce qui s'affiche partout ailleurs.

export function useCreateAchievement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      body,
    }: {
      projectId: string
      body: AchievementCreate
    }): Promise<Achievement> => {
      const { data, error, response } = await api.POST(
        '/projects/{project_id}/achievements',
        { params: { path: { project_id: projectId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useUpdateAchievement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: AchievementUpdate
    }): Promise<Achievement> => {
      const { data, error, response } = await api.PATCH(
        '/achievements/{achievement_id}',
        { params: { path: { achievement_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useDeleteAchievement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/achievements/{achievement_id}',
        { params: { path: { achievement_id: id } } },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

// --- Distribution d'un résultat à une étape --------------------------------

export function useSetStepMetric() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stepId,
      metricId,
      target,
    }: {
      stepId: string
      metricId: string
      target: number | null
    }): Promise<Project> => {
      const { data, error, response } = await api.PUT(
        '/steps/{step_id}/metrics',
        {
          params: { path: { step_id: stepId } },
          body: { metric_id: metricId, target },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

export function useUnsetStepMetric() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stepId,
      metricId,
    }: {
      stepId: string
      metricId: string
    }): Promise<Project> => {
      const { data, error, response } = await api.DELETE(
        '/steps/{step_id}/metrics/{metric_id}',
        { params: { path: { step_id: stepId, metric_id: metricId } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.root }),
  })
}

// --- Totaux ------------------------------------------------------------------
//
// Toutes les mutations renvoient le projet entier : un Total change ce que
// le projet exige, donc son statut, et ce que ses étapes exigent.

function useProjectMutation<V>(
  run: (
    vars: V,
  ) => Promise<{ data?: Project; error?: unknown; response: Response }>,
  // Réécriture optimiste du projet en cache : ce que le serveur rendra,
  // posé tout de suite, pour qu'un geste continu (la jauge d'une étape) ne
  // saute pas le temps de l'aller-retour.
  optimistic?: (project: Project, vars: V) => Project,
) {
  const queryClient = useQueryClient()
  const details = { queryKey: ['projects', 'detail'] as const }
  return useMutation({
    mutationFn: async (vars: V): Promise<Project> => {
      const { data, error, response } = await run(vars)
      if (error || !data) throw toApiError(error, response)
      return data
    },
    onMutate: async (vars: V) => {
      if (!optimistic) return undefined
      await queryClient.cancelQueries(details)
      const before = queryClient.getQueriesData<Project>(details)
      for (const [key, o] of before)
        if (o) queryClient.setQueryData(key, optimistic(o, vars))
      return before
    },
    onError: (_err, _vars, before) => {
      for (const [key, o] of before ?? []) queryClient.setQueryData(key, o)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(projectKeys.detail(data.id), data)
      return queryClient.invalidateQueries({ queryKey: projectKeys.root })
    },
  })
}

/** Réécrit les tranches d'un Total confiées à une étape, où qu'elle soit. */
function withStepTotal(
  o: Project,
  stepId: string,
  totalId: string,
  target: number | null,
): Project {
  if (!o.steps.some((s) => s.id === stepId)) return o
  return {
    ...o,
    steps: o.steps.map((s) => {
      if (s.id !== stepId) return s
      const rest = s.totals.filter((t) => t.total_id !== totalId)
      if (target === null) return { ...s, totals: rest }
      const prev = s.totals.find((t) => t.total_id === totalId)
      return {
        ...s,
        totals: [
          ...rest,
          {
            progress: 0,
            is_met: false,
            ...prev,
            total_id: totalId,
            target,
          },
        ],
      }
    }),
  }
}

export function useCreateTotal() {
  return useProjectMutation(
    ({ projectId, body }: { projectId: string; body: TotalCreate }) =>
      api.POST('/projects/{project_id}/totals', {
        params: { path: { project_id: projectId } },
        body,
      }),
  )
}

export function useUpdateTotal() {
  return useProjectMutation(
    ({ totalId, body }: { totalId: string; body: TotalUpdate }) =>
      api.PATCH('/totals/{total_id}', {
        params: { path: { total_id: totalId } },
        body,
      }),
  )
}

export function useDeleteTotal() {
  return useProjectMutation(({ totalId }: { totalId: string }) =>
    api.DELETE('/totals/{total_id}', {
      params: { path: { total_id: totalId } },
    }),
  )
}

/** Confie à une étape une tranche d'un Total (upsert). */
export function useSetStepTotal() {
  return useProjectMutation(
    ({
      stepId,
      totalId,
      target,
    }: {
      stepId: string
      totalId: string
      target: number
    }) =>
      api.PUT('/steps/{step_id}/totals', {
        params: { path: { step_id: stepId } },
        body: { total_id: totalId, target },
      }),
    (o, { stepId, totalId, target }) =>
      withStepTotal(o, stepId, totalId, target),
  )
}

export function useUnsetStepTotal() {
  return useProjectMutation(
    ({ stepId, totalId }: { stepId: string; totalId: string }) =>
      api.DELETE('/steps/{step_id}/totals/{total_id}', {
        params: { path: { step_id: stepId, total_id: totalId } },
      }),
    (o, { stepId, totalId }) => withStepTotal(o, stepId, totalId, null),
  )
}
