import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  AcquisitionPlan,
  PlanCreate,
  PlanItemUpdate,
  PlanResource,
  PlanUpdate,
} from '../model/types'

export const planKeys = {
  root: ['plans'] as const,
  list: (skillId: string) => ['plans', 'list', skillId] as const,
}

/** L'historique des cycles d'un savoir — c'est l'échelle de maîtrise. */
export function usePlans(skillId: string | undefined) {
  return useQuery({
    queryKey: planKeys.list(skillId ?? ''),
    queryFn: async (): Promise<AcquisitionPlan[]> => {
      const { data, error, response } = await api.GET(
        '/skills/{skill_id}/plans',
        {
          params: { path: { skill_id: skillId as string } },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(skillId),
  })
}

/**
 * Invalide les cycles, les compétences, les projets, la bibliothèque ET les
 * activités : le statut d'un savoir est dérivé de ses cycles, la condition
 * d'un projet lit son cycle, **ouvrir un cycle crée l'interro** côté
 * serveur, et les passes d'un cycle se comptent sur ses séances.
 *
 * Les clés étrangères sont écrites à plat plutôt qu'importées : deux slices
 * d'une même couche ne s'importent pas. C'est la contrepartie assumée — si une
 * racine de clé change, c'est ici qu'il faut penser à suivre.
 */
function usePlanMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: planKeys.root })
    queryClient.invalidateQueries({ queryKey: ['skills'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['practice'] })
    queryClient.invalidateQueries({ queryKey: ['activities'] })
  }
}

export function useCreatePlan() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      skillId,
      body,
    }: {
      skillId: string
      body: PlanCreate
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/plans',
        { params: { path: { skill_id: skillId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Commencer un savoir : pour un projet, son cycle s'ouvre (ou naît ouvert,
 * rattaché à lui) ; sans projet, le dernier cycle prévu, sinon un cycle
 * neuf. Refusé (422) si un autre cycle est déjà en cours.
 */
export function useStartSkill() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      skillId,
      projectId,
    }: {
      skillId: string
      projectId?: string
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/plans/start',
        {
          params: { path: { skill_id: skillId } },
          body: { project_id: projectId ?? null },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdatePlan() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: PlanUpdate
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.PATCH('/plans/{plan_id}', {
        params: { path: { plan_id: id } },
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Les transitions sans corps, une route chacune : `open` commence un cycle
 * prévu, `abandon` l'arrête sans rien acter, `reopen` reprend un cycle
 * abandonné — un cycle abouti, lui, ne se rouvre pas. Terminer et constater
 * portent un corps (`useCompletePlan`, `useObservePlan`).
 */
const TRANSITIONS = {
  open: '/plans/{plan_id}/open',
  abandon: '/plans/{plan_id}/abandon',
  reopen: '/plans/{plan_id}/reopen',
  unstart: '/plans/{plan_id}/unstart',
} as const

export function usePlanTransition(action: keyof typeof TRANSITIONS) {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async (id: string): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(TRANSITIONS[action], {
        params: { path: { plan_id: id } },
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * « Lancer l'interro » (#157) : la courbe de l'interro démarre. Sans séance,
 * le serveur pose l'interro demain, en journée entière (une activité
 * « Interro · savoir ») ; avec une séance (non faite, du domaine, de J+1 à
 * J+3), le premier test s'y rattache et la courbe part de son jour.
 */
export function useLaunchRecall() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      id,
      activityId,
    }: {
      id: string
      activityId?: string
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/recall/launch',
        {
          params: { path: { plan_id: id } },
          // Le corps est obligatoire : vide, sans séance.
          body: activityId ? { activity_id: activityId } : {},
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * « Valider l'étude sans interro » (#157) : une étude **sans questions** se valide à la
 * main — refusé (422) s'il y en a : elle se lit alors sur son interro.
 */
export function useValidateStudy() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async (id: string): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/study/validate',
        { params: { path: { plan_id: id } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Recommencer l'interro (#102) : la courbe repart à J+1 — même terminée —,
 * une passation ouverte est abandonnée, l'historique note « Recommencée ».
 */
export function useRestartRecall() {
  const queryClient = useQueryClient()
  const onPlans = usePlanMutationSuccess()
  // L'historique et la passation abandonnée se relisent aussi (clé écrite à
  // plat : deux entités ne s'importent pas).
  const onSuccess = () => {
    onPlans()
    queryClient.invalidateQueries({ queryKey: ['recall'] })
  }

  return useMutation({
    mutationFn: async (id: string): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/recall/restart',
        { params: { path: { plan_id: id } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeletePlan() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await api.DELETE('/plans/{plan_id}', {
        params: { path: { plan_id: id } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/**
 * Terminer : acquis, avec ce qu'on garde en rétention (la liste entière des
 * objets, et l'interro — non gardée, sa courbe s'arrête).
 */
export function useCompletePlan() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      id,
      retentionItemIds,
      recallInRetention,
    }: {
      id: string
      retentionItemIds?: string[]
      recallInRetention?: boolean
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/complete',
        {
          params: { path: { plan_id: id } },
          body: {
            retention_item_ids: retentionItemIds ?? null,
            recall_in_retention: recallInRetention ?? null,
          },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

// --- La rampe d'un cycle ---

/** Piocher un objet de la bibliothèque : il arrive en fin de sa rampe. */
export function useAddPlanItem() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      planId,
      itemId,
    }: {
      planId: string
      itemId: string
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/items',
        { params: { path: { plan_id: planId } }, body: { item_id: itemId } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Le verdict d'un objet dans ce cycle, sa rétention ou son critère de
 * maîtrise (#157). */
export function useUpdatePlanItem() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      planId,
      itemId,
      body,
    }: {
      planId: string
      itemId: string
      body: PlanItemUpdate
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.PATCH(
        '/plans/{plan_id}/items/{item_id}',
        { params: { path: { plan_id: planId, item_id: itemId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Retirer du cycle : l'objet reste dans la bibliothèque. */
export function useRemovePlanItem() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      planId,
      itemId,
    }: {
      planId: string
      itemId: string
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.DELETE(
        '/plans/{plan_id}/items/{item_id}',
        { params: { path: { plan_id: planId, item_id: itemId } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Réordonner une rampe du cycle — la liste **entière** d'une nature. */
export function useReorderPlanItems() {
  const onSuccess = usePlanMutationSuccess()

  return useMutation({
    mutationFn: async ({
      planId,
      nature,
      itemIds,
    }: {
      planId: string
      nature: 'isolated' | 'situation'
      itemIds: string[]
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.PUT(
        '/plans/{plan_id}/items/order',
        {
          params: { path: { plan_id: planId } },
          body: { nature, item_ids: itemIds },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Les ressources d'un cycle bougent sous les yeux (glisser, coche) : le cache
 * du savoir suit **avant** la réponse — sinon la ligne lâchée revient un
 * instant à son ancienne place. Un échec rend l'état d'avant ; dans tous les
 * cas les cycles se relisent, eux seuls : l'ordre et la coche ne changent ni
 * statut, ni projet, ni séance.
 */
function usePlanResourcesCache<V extends { planId: string }>(
  skillId: string,
  patch: (resources: PlanResource[], vars: V) => PlanResource[],
) {
  const queryClient = useQueryClient()
  const key = planKeys.list(skillId)
  return {
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<AcquisitionPlan[]>(key)
      queryClient.setQueryData<AcquisitionPlan[]>(key, (plans) =>
        plans?.map((p) =>
          p.id === vars.planId
            ? { ...p, resources: patch(p.resources, vars) }
            : p,
        ),
      )
      return { before }
    },
    onError: (
      _err: unknown,
      _vars: V,
      context: { before?: AcquisitionPlan[] } | undefined,
    ) => {
      if (context?.before) queryClient.setQueryData(key, context.before)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: planKeys.root }),
  }
}

/**
 * L'**ordre de consommation** des ressources d'un cycle (#173) : la liste
 * **entière** de ses ressources, dans l'ordre voulu (422 sinon).
 */
export function useReorderPlanResources(skillId: string) {
  const cache = usePlanResourcesCache<{
    planId: string
    resourceIds: string[]
  }>(skillId, (resources, { resourceIds }) => {
    const rank = new Map(resourceIds.map((id, i) => [id, i]))
    return resources
      .map((r) => ({ ...r, position: rank.get(r.resource_id) ?? r.position }))
      .sort((a, b) => a.position - b.position)
  })

  return useMutation({
    mutationFn: async ({
      planId,
      resourceIds,
    }: {
      planId: string
      resourceIds: string[]
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.PUT(
        '/plans/{plan_id}/resources/order',
        {
          params: { path: { plan_id: planId } },
          body: { resource_ids: resourceIds },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    ...cache,
  })
}

/**
 * Cocher ou décocher « consommée » une ressource du cycle (#173) : cocher
 * pose la date, décocher la vide. Sa position ne bouge pas — les consommées
 * en bas, c'est l'affichage qui le fait.
 */
export function useSetPlanResourceConsumed(skillId: string) {
  const cache = usePlanResourcesCache<{
    planId: string
    resourceId: string
    consumed: boolean
  }>(skillId, (resources, { resourceId, consumed }) =>
    resources.map((r) =>
      r.resource_id === resourceId
        ? {
            ...r,
            consumed_at: consumed
              ? (r.consumed_at ?? new Date().toISOString())
              : null,
          }
        : r,
    ),
  )

  return useMutation({
    mutationFn: async ({
      planId,
      resourceId,
      consumed,
    }: {
      planId: string
      resourceId: string
      consumed: boolean
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.PATCH(
        '/plans/{plan_id}/resources/{resource_id}',
        {
          params: { path: { plan_id: planId, resource_id: resourceId } },
          body: { consumed },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    ...cache,
  })
}

/**
 * Lier une ressource du cycle aux **parties de son périmètre** qu'elle
 * couvre (30/10) : la liste entière des libellés, des parties retenues du
 * périmètre courant (422 sinon). Le cache suit avant la réponse, comme la
 * coche.
 */
export function useSetPlanResourceScopeParts(skillId: string) {
  const cache = usePlanResourcesCache<{
    planId: string
    resourceId: string
    scopeParts: string[]
  }>(skillId, (resources, { resourceId, scopeParts }) =>
    resources.map((r) =>
      r.resource_id === resourceId ? { ...r, scope_parts: scopeParts } : r,
    ),
  )

  return useMutation({
    mutationFn: async ({
      planId,
      resourceId,
      scopeParts,
    }: {
      planId: string
      resourceId: string
      scopeParts: string[]
    }): Promise<AcquisitionPlan> => {
      const { data, error, response } = await api.PATCH(
        '/plans/{plan_id}/resources/{resource_id}',
        {
          params: { path: { plan_id: planId, resource_id: resourceId } },
          body: { scope_parts: scopeParts },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    ...cache,
  })
}
