import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { PreparationProject, WeekPreparation } from '../model/types'

/** `weekStart` : le lundi de la semaine préparée, au format ISO. */
export const preparationKeys = {
  root: ['preparations'] as const,
  week: (weekStart: string) => ['preparations', weekStart] as const,
  project: (weekStart: string, projectId: string, steps?: WeekSteps) =>
    [
      'preparations',
      weekStart,
      'projects',
      projectId,
      steps?.past ?? null,
      steps?.next ?? null,
    ] as const,
}

/** Les étapes choisies pour les deux semaines d'un projet (#183) ;
 *  absentes : celles par défaut (celle qui couvre le lundi). */
export interface WeekSteps {
  past?: string | null
  next?: string | null
}

/** La préparation d'une semaine, ou `null` si elle n'existe pas encore. */
export function useWeekPreparation(weekStart: string, enabled = true) {
  return useQuery({
    queryKey: preparationKeys.week(weekStart),
    enabled,
    queryFn: async (): Promise<WeekPreparation | null> => {
      const { data, error, response } = await api.GET(
        '/preparations/{week_start}',
        { params: { path: { week_start: weekStart } } },
      )
      if (response.status === 404) return null
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

async function fetchProject(
  weekStart: string,
  projectId: string,
  steps?: WeekSteps,
): Promise<PreparationProject> {
  const { data, error, response } = await api.GET(
    '/preparations/{week_start}/projects/{project_id}',
    {
      params: {
        path: { week_start: weekStart, project_id: projectId },
        query: {
          past_step: steps?.past ?? undefined,
          next_step: steps?.next ?? undefined,
        },
      },
    },
  )
  if (error) throw toApiError(error, response)
  return data
}

/**
 * Ce que la préparation montre d'un projet. Lecture seule, calculée par le
 * serveur ; tout geste sur une activité ou un projet la relit (clé
 * `preparations`, invalidée par les mutations ci-dessous, et par l'appelant
 * des gestes sur les activités via `useInvalidatePreparations`).
 */
export function usePreparationProject(
  weekStart: string,
  projectId: string | null,
  steps?: WeekSteps,
) {
  return useQuery({
    queryKey: preparationKeys.project(weekStart, projectId ?? '', steps),
    enabled: projectId !== null,
    queryFn: () => fetchProject(weekStart, projectId as string, steps),
    // Changer d'étape garde la lecture d'avant le temps de la nouvelle.
    placeholderData: (previous) => previous,
  })
}

/**
 * La même lecture pour plusieurs projets à la fois — ce que le calendrier
 * de la préparation montre sur les séances (les cibles posées), pour tous les
 * projets de la liste. Partage son cache avec `usePreparationProject`.
 */
export function usePreparationProjects(
  weekStart: string,
  projectIds: string[],
  steps: Record<string, WeekSteps> = {},
): PreparationProject[] {
  return useQueries({
    queries: projectIds.map((id) => ({
      queryKey: preparationKeys.project(weekStart, id, steps[id]),
      queryFn: () => fetchProject(weekStart, id, steps[id]),
    })),
    combine: (results) => results.flatMap((r) => (r.data ? [r.data] : [])),
  })
}

/**
 * Relire la préparation après un geste fait ailleurs (une activité cochée,
 * reportée, liée ; une cible posée) : ces mutations ne connaissent pas la
 * préparation.
 */
export function useInvalidatePreparations() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: preparationKeys.root })
}

/**
 * Démarrer, revoir, valider : la préparation change, et avec elle les
 * activités (démarrer pose la semaine, valider coche et déplace l'activité du
 * rituel).
 */
function usePreparationMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: preparationKeys.root })
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    queryClient.invalidateQueries({ queryKey: ['planning'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
}

/** Démarre (idempotent) : crée la préparation au besoin et pose jusqu'à son
 *  dimanche les replis des domaines — jamais dans le passé. */
export function useStartWeekPreparation() {
  const onSuccess = usePreparationMutationSuccess()
  return useMutation({
    mutationFn: async (weekStart: string): Promise<WeekPreparation> => {
      const { data, error, response } = await api.POST(
        '/preparations/{week_start}/start',
        { params: { path: { week_start: weekStart } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** « Projet préparé » : marque (ou démarque) un projet comme revu. */
export function useSetProjectReviewed() {
  const onSuccess = usePreparationMutationSuccess()
  return useMutation({
    mutationFn: async ({
      weekStart,
      projectId,
      reviewed,
    }: {
      weekStart: string
      projectId: string
      reviewed: boolean
    }): Promise<WeekPreparation> => {
      const path = { week_start: weekStart, project_id: projectId }
      const route = '/preparations/{week_start}/projects/{project_id}/reviewed'
      const { data, error, response } = reviewed
        ? await api.PUT(route, { params: { path } })
        : await api.DELETE(route, { params: { path } })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Valide la préparation : l'activité du rituel passe faite, ce jour. */
export function useValidateWeekPreparation() {
  const onSuccess = usePreparationMutationSuccess()
  return useMutation({
    mutationFn: async (weekStart: string): Promise<WeekPreparation> => {
      const { data, error, response } = await api.POST(
        '/preparations/{week_start}/validate',
        { params: { path: { week_start: weekStart } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Planifier un créneau pour préparer une semaine dont le rituel n'a pas
 * d'activité (posé dans le passé, supprimé, pas encore posé). Une seule
 * activité par rituel : le serveur refuse s'il y en a déjà une.
 */
export function usePlanWeekPreparationActivity() {
  const onSuccess = usePreparationMutationSuccess()
  return useMutation({
    mutationFn: async ({
      weekStart,
      startAt,
      endAt,
    }: {
      weekStart: string
      startAt: string
      endAt: string
    }): Promise<WeekPreparation> => {
      const { data, error, response } = await api.POST(
        '/preparations/{week_start}/activity',
        {
          params: { path: { week_start: weekStart } },
          body: { start_at: startAt, end_at: endAt },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Poser les séances d'un projet pour la semaine préparée — en ouvrant sa
 * semaine prochaine : le calendrier se construit au fil de la préparation.
 * Idempotent.
 */
export function usePoseWeekPreparationProject() {
  const onSuccess = usePreparationMutationSuccess()
  return useMutation({
    mutationFn: async ({
      weekStart,
      projectId,
    }: {
      weekStart: string
      projectId: string
    }): Promise<PreparationProject> => {
      const { data, error, response } = await api.POST(
        '/preparations/{week_start}/projects/{project_id}/pose',
        {
          params: {
            path: { week_start: weekStart, project_id: projectId },
          },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}
