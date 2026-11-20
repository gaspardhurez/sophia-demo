import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  Activity,
  ActivityActSet,
  ActivityCreate,
  ActivityUpdate,
} from '../model/types'

export const activityKeys = {
  root: ['activities'] as const,
}

interface ActivityFilters {
  domainId?: string
  stepId?: string
  projectId?: string
  /**
   * Savoir travaillé (un acte de l'activité). **Sans bornes**, c'est
   * l'historique complet d'une compétence.
   */
  skillId?: string
  start?: string
  end?: string
  /** Les interros encore à passer (non faites) ; bornées à aujourd'hui, ce
   *  sont celles en retard (#84). */
  recallPending?: boolean
}

/**
 * Lire n'écrit rien (#37) : les occurrences des activités types se posent en
 * **préparant** (`POST /planning/prepare`), jamais à la lecture d'une fenêtre.
 * Ce qui n'est pas encore posé arrive à part (`/planning/preview`), en
 * fantômes. Une seule lecture par
 * surface reste la règle — élargie si besoin, filtrée localement : c'est moins
 * de requêtes, et plus rien ne justifie de la découper.
 */
export function useActivities(filters: ActivityFilters = {}) {
  return useQuery({
    queryKey: ['activities', filters],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error, response } = await api.GET('/activities', {
        params: {
          query: {
            domain_id: filters.domainId,
            step_id: filters.stepId,
            project_id: filters.projectId,
            skill_id: filters.skillId,
            start: filters.start,
            end: filters.end,
            recall_pending: filters.recallPending,
          },
        },
      })
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/**
 * Invalide les activités, les projets ET les métriques.
 *
 * Projets : la progression d'une étape est dérivée des activités faites, donc
 * toute mutation d'activité peut bouger une barre.
 *
 * Métriques : déplacer une séance ré-estampille la date de ses relevés côté
 * back. Sans cette ligne, la carte gardait l'ancienne date jusqu'au prochain
 * rechargement — le drag corrigeait la base mais pas l'écran.
 *
 * Cycles et bibliothèque : leurs passes se comptent sur les activités faites
 * qui portent un acte (#82).
 *
 * Savoirs : cocher une séance qui porte une pièce d'un cycle prévu ouvre ce
 * cycle (#108) — le statut et la jauge du savoir changent.
 */
function useActivityMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: activityKeys.root })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['metrics'] })
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    queryClient.invalidateQueries({ queryKey: ['practice'] })
    queryClient.invalidateQueries({ queryKey: ['skills'] })
    // La préparation de la semaine lit les séances (faites, non faites,
    // liées) : elle suit le calendrier en direct.
    queryClient.invalidateQueries({ queryKey: ['preparations'] })
  }
}

export function useCreateActivity() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async (body: ActivityCreate): Promise<Activity> => {
      const { data, error, response } = await api.POST('/activities', { body })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdateActivity() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: ActivityUpdate
    }): Promise<Activity> => {
      const { data, error, response } = await api.PATCH(
        '/activities/{activity_id}',
        {
          params: { path: { activity_id: id } },
          body,
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeleteActivity() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/activities/{activity_id}',
        {
          params: { path: { activity_id: id } },
        },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/**
 * Déplacer une sélection du même décalage (calendrier, sélection multiple) :
 * toutes ou aucune. Une journée entière ignore les minutes ; les relevés
 * suivent la date. Le décalage inverse l'annule.
 */
export function useMoveActivities() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async (body: {
      ids: string[]
      days: number
      minutes: number
    }): Promise<Activity[]> => {
      const { data, error, response } = await api.POST('/activities/move', {
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Supprimer une sélection, toutes ou aucune. */
export function useDeleteActivities() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }): Promise<void> => {
      const { error, response } = await api.POST('/activities/delete', {
        body: { ids },
      })
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/**
 * Ajouter un acte d'apprentissage à une activité (#82). Celui d'un cycle lui
 * apporte les projets du cycle : la réponse les porte.
 */
export function useAddActivityAct() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      act,
    }: {
      id: string
      act: ActivityActSet
    }): Promise<Activity> => {
      const { data, error, response } = await api.POST(
        '/activities/{activity_id}/acts',
        { params: { path: { activity_id: id } }, body: act },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Retirer un acte de l'activité ; ses projets restent. */
export function useRemoveActivityAct() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      actId,
    }: {
      id: string
      actId: string
    }): Promise<Activity> => {
      const { data, error, response } = await api.DELETE(
        '/activities/{activity_id}/acts/{act_id}',
        { params: { path: { activity_id: id, act_id: actId } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Le retour d'une passe (#139) : un niveau 1–5 et une note, sur un acte de
 * pratique ; un niveau nul l'efface. Ni la coche ni le verdict ne bougent.
 */
export function useSetActFeedback() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      actId,
      level,
      feedback,
    }: {
      id: string
      actId: string
      level: number | null
      feedback: string | null
    }): Promise<Activity> => {
      const { data, error, response } = await api.PUT(
        '/activities/{activity_id}/acts/{act_id}/feedback',
        {
          params: { path: { activity_id: id, act_id: actId } },
          body: { level, feedback },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Reporter (#92) : une activité non faite part à la semaine suivante, même
 * jour, même heure, avec tout ce qu'elle porte (liens, actes, réalisations,
 * cibles). Le serveur garde le jour d'origine (`postponed_from`).
 */
export function usePostponeActivity() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<Activity> => {
      const { data, error, response } = await api.POST(
        '/activities/{activity_id}/postpone',
        { params: { path: { activity_id: id } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Annuler un report : l'activité revient une semaine plus tôt, ses cibles
 *  avec elle ; revenue à son jour d'origine, elle n'est plus « reportée ». */
export function useUnpostponeActivity() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<Activity> => {
      const { data, error, response } = await api.POST(
        '/activities/{activity_id}/unpostpone',
        { params: { path: { activity_id: id } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Lier une réalisation à une séance (#92) : la séance la prépare. Seulement
 * une réalisation d'un projet de l'activité ; ne la coche pas.
 */
export function useLinkActivityAchievement() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      achievementId,
    }: {
      id: string
      achievementId: string
    }): Promise<Activity> => {
      const { data, error, response } = await api.POST(
        '/activities/{activity_id}/achievements',
        {
          params: { path: { activity_id: id } },
          body: { achievement_id: achievementId },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUnlinkActivityAchievement() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      achievementId,
    }: {
      id: string
      achievementId: string
    }): Promise<Activity> => {
      const { data, error, response } = await api.DELETE(
        '/activities/{activity_id}/achievements/{achievement_id}',
        {
          params: {
            path: { activity_id: id, achievement_id: achievementId },
          },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/**
 * Fusionner `sourceId` dans `id` (une séance déposée sur une autre) : ses
 * actes et ses projets y passent, elle est supprimée. Même domaine ; le
 * serveur refuse une séance qui porte autre chose (cochée, valeurs, relevés,
 * notes, réalisations).
 */
export function useMergeActivity() {
  const onSuccess = useActivityMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      sourceId,
    }: {
      id: string
      sourceId: string
    }): Promise<Activity> => {
      const { data, error, response } = await api.POST(
        '/activities/{activity_id}/merge',
        {
          params: { path: { activity_id: id } },
          body: { source_id: sourceId },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}
