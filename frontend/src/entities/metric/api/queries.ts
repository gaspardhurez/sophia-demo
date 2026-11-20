import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  Metric,
  MetricCreate,
  MetricUpdate,
  MetricUsage,
  MetricValue,
  ProjectMetric,
} from '../model/types'

export const metricKeys = {
  root: ['metrics'] as const,
}

/**
 * Invalide métriques + projets : un relevé change « où j'en suis », et un
 * résultat visé s'affiche sur la page projet.
 */
function useMetricMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: metricKeys.root })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    // Les relevés d'une activité vivent sous la clé `activities`.
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    // Une cible de la semaine se lit dans la préparation.
    queryClient.invalidateQueries({ queryKey: ['preparations'] })
  }
}

const metricsQuery = (domainId: string | undefined) => ({
  queryKey: ['metrics', 'domain', domainId ?? null],
  enabled: Boolean(domainId),
  queryFn: async (): Promise<Metric[]> => {
    const { data, error, response } = await api.GET(
      '/domains/{domain_id}/metrics',
      { params: { path: { domain_id: domainId! } } },
    )
    if (error) throw toApiError(error, response)
    return data
  },
})

/** Le catalogue d'un domaine — c'est là que vit une métrique. */
export function useMetrics(domainId?: string) {
  return useQuery(metricsQuery(domainId))
}

/** Les catalogues de plusieurs domaines, à la suite — ceux d'un projet
 *  (#203). `data` attend que tous soient là. */
export function useDomainsMetrics(domainIds: string[]) {
  return useQueries({
    queries: domainIds.map(metricsQuery),
    combine: joinMetrics,
  })
}

// Hors du hook : une référence stable (cf. `useDomainsSkills`).
function joinMetrics(results: { data?: Metric[] }[]) {
  return {
    data: results.every((r) => r.data)
      ? results.flatMap((r) => r.data ?? [])
      : undefined,
  }
}

export function useCreateMetric(domainId: string) {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async (body: MetricCreate): Promise<Metric> => {
      const { data, error, response } = await api.POST(
        '/domains/{domain_id}/metrics',
        { params: { path: { domain_id: domainId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdateMetric() {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: MetricUpdate
    }): Promise<Metric> => {
      const { data, error, response } = await api.PATCH(
        '/metrics/{metric_id}',
        {
          params: { path: { metric_id: id } },
          body,
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeleteMetric() {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error, response } = await api.DELETE('/metrics/{metric_id}', {
        params: { path: { metric_id: id } },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/** Ce qu'une suppression emporterait (relevés) et délierait (projets). */
export function useMetricUsage(metricId: string | null) {
  return useQuery({
    queryKey: ['metrics', metricId, 'usage'],
    enabled: Boolean(metricId),
    // Le décompte doit refléter l'état réel au moment où on pose la question.
    staleTime: 0,
    queryFn: async (): Promise<MetricUsage> => {
      const { data, error, response } = await api.GET(
        '/metrics/{metric_id}/usage',
        { params: { path: { metric_id: metricId! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

// --- Relevés ---------------------------------------------------------------

/** L'historique d'une métrique, du plus ancien au plus récent. */
export function useMetricValues(metricId: string | null) {
  return useQuery({
    queryKey: ['metrics', metricId, 'values'],
    enabled: Boolean(metricId),
    queryFn: async (): Promise<MetricValue[]> => {
      const { data, error, response } = await api.GET(
        '/metrics/{metric_id}/values',
        { params: { path: { metric_id: metricId! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/**
 * Les relevés d'une activité, en **options de requête** plutôt qu'en hook.
 *
 * Extrait pour être lisible aussi de façon impérative (`fetchQuery`) : avant de
 * supprimer une séance, il faut savoir ce qu'elle emporte, et ça se demande au
 * clic — pas au rendu, où l'on ne sait pas encore quelle séance sera visée.
 */
export function activityMetricValuesQuery(activityId: string | null) {
  return {
    queryKey: ['activities', activityId, 'metric-values'] as const,
    queryFn: async (): Promise<MetricValue[]> => {
      const { data, error, response } = await api.GET(
        '/activities/{activity_id}/metric-values',
        { params: { path: { activity_id: activityId! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  }
}

/** Les relevés pris au cours d'une activité — une séance en porte plusieurs. */
export function useActivityMetricValues(activityId: string | null) {
  return useQuery({
    ...activityMetricValuesQuery(activityId),
    enabled: Boolean(activityId),
  })
}

export function useAddMetricValue() {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({
      metricId,
      value,
      measuredAt,
      activityId,
    }: {
      metricId: string
      value: number
      measuredAt: string
      /** L'activité d'où vient le relevé, si elle existe. */
      activityId?: string | null
    }): Promise<MetricValue> => {
      const { data, error, response } = await api.POST(
        '/metrics/{metric_id}/values',
        {
          params: { path: { metric_id: metricId } },
          body: {
            value,
            measured_at: measuredAt,
            activity_id: activityId ?? null,
          },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeleteMetricValue() {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/metric-values/{value_id}',
        { params: { path: { value_id: id } } },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

// --- Résultats visés -------------------------------------------------------

/** Ce que ce projet vise, avec la métrique (donc « où j'en suis »). */
export function useProjectMetrics(projectId?: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'metrics'],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectMetric[]> => {
      const { data, error, response } = await api.GET(
        '/projects/{project_id}/metrics',
        { params: { path: { project_id: projectId! } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/**
 * Désigne le relevé de départ d'un Résultat pour ce projet, ou rend la main
 * à la règle (`valueId: null`) — le record d'avant la saison, sinon le premier
 * relevé de la saison.
 */
export function useSetProjectMetricStart(projectId: string) {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({
      metricId,
      valueId,
    }: {
      metricId: string
      valueId: string | null
    }): Promise<ProjectMetric> => {
      const { data, error, response } = await api.PUT(
        '/projects/{project_id}/metrics/{metric_id}/start',
        {
          params: {
            path: { project_id: projectId, metric_id: metricId },
          },
          body: { value_id: valueId },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useSetProjectMetric(projectId?: string) {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({
      metricId,
      target,
      projectId: override,
    }: {
      metricId: string
      target: number
      /**
       * Projet visé, quand il n'est pas connu au montage du hook — c'est le
       * cas à la **création** : les résultats visés vivent dans leur propre
       * table et ne peuvent se poser qu'une fois le projet créé, donc son id
       * n'arrive qu'au retour du POST.
       */
      projectId?: string
    }): Promise<ProjectMetric> => {
      const { data, error, response } = await api.PUT(
        '/projects/{project_id}/metrics',
        {
          params: { path: { project_id: override ?? projectId! } },
          body: { metric_id: metricId, target },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUnsetProjectMetric(projectId: string) {
  const onSuccess = useMetricMutationSuccess()
  return useMutation({
    mutationFn: async ({ metricId }: { metricId: string }): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/projects/{project_id}/metrics/{metric_id}',
        {
          params: {
            path: { project_id: projectId, metric_id: metricId },
          },
        },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}
