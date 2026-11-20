import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { RecallSession, RecallSessionSummary } from '../model/types'

export const recallKeys = {
  root: ['recall'] as const,
  session: (id: string) => ['recall', 'session', id] as const,
  history: (planId: string) => ['recall', 'history', planId] as const,
}

/** Une passation, ses questions et ses réponses. */
export function useRecallSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: recallKeys.session(sessionId ?? ''),
    queryFn: async (): Promise<RecallSession> => {
      const { data, error, response } = await api.GET(
        '/recall-sessions/{session_id}',
        { params: { path: { session_id: sessionId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(sessionId),
  })
}

/** Les passations terminées d'un cycle, de la plus récente à la plus ancienne. */
export function useRecallHistory(planId: string | undefined) {
  return useQuery({
    queryKey: recallKeys.history(planId ?? ''),
    queryFn: async (): Promise<RecallSessionSummary[]> => {
      const { data, error, response } = await api.GET(
        '/plans/{plan_id}/recall-sessions',
        { params: { path: { plan_id: planId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(planId),
  })
}

/**
 * La réponse remplace la passation en cache ; les cycles se rechargent — la
 * passation en cours et la courbe y sont lues (clé écrite à plat : deux
 * entités ne s'importent pas).
 */
function useSessionSuccess() {
  const queryClient = useQueryClient()
  return (session: RecallSession, cycles = false) => {
    queryClient.setQueryData(recallKeys.session(session.id), session)
    if (cycles) {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({
        queryKey: recallKeys.history(session.plan_id),
      })
    }
  }
}

/** Passer l'interro : une nouvelle passation, ou celle qu'on avait quittée. */
export function useStartRecall() {
  const onSuccess = useSessionSuccess()
  return useMutation({
    mutationFn: async (planId: string): Promise<RecallSession> => {
      const { data, error, response } = await api.POST(
        '/plans/{plan_id}/recall',
        { params: { path: { plan_id: planId } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (session) => onSuccess(session, true),
  })
}

/**
 * Le passage en cours d'une question : le texte tapé, puis le verdict —
 * `known` pour une réponse libre, `known_points` (les éléments donnés) pour
 * une liste. Ratée, elle passe en fin de file ; la dernière sue termine la
 * passation, et la courbe du cycle avance.
 */
export function useAnswerRecall() {
  const onSuccess = useSessionSuccess()
  return useMutation({
    mutationFn: async ({
      sessionId,
      answerId,
      answer,
      known = null,
      knownPoints = null,
    }: {
      sessionId: string
      answerId: string
      answer: string | null
      known?: boolean | null
      knownPoints?: string[] | null
    }): Promise<RecallSession> => {
      const { data, error, response } = await api.PUT(
        '/recall-sessions/{session_id}/answers/{answer_id}',
        {
          params: { path: { session_id: sessionId, answer_id: answerId } },
          body: { answer, known, known_points: knownPoints },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (session) => onSuccess(session, session.finished_at != null),
  })
}

/**
 * Les notes du savoir viennent de s'ouvrir : dans ses interros en cours, ce
 * qui reste à passer attend à nouveau dix minutes. Les passations se
 * relisent (celle ouverte dans un autre onglet le verra au retour).
 */
export function useNotesOpened() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (skillId: string): Promise<void> => {
      const { error, response } = await api.POST(
        '/skills/{skill_id}/notes/opened',
        { params: { path: { skill_id: skillId } } },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...recallKeys.root, 'session'],
      }),
  })
}

/**
 * « Réviser » (dès le 3ᵉ passage, #103) : une séance de révision du savoir
 * ce jour-là, rattachée à la question ; une seconde date la déplace. Le
 * calendrier se relit.
 */
export function useSetRevision() {
  const queryClient = useQueryClient()
  const onSuccess = useSessionSuccess()
  return useMutation({
    mutationFn: async ({
      sessionId,
      answerId,
      day,
    }: {
      sessionId: string
      answerId: string
      day: string
    }): Promise<RecallSession> => {
      const { data, error, response } = await api.PUT(
        '/recall-sessions/{session_id}/answers/{answer_id}/revision',
        {
          params: { path: { session_id: sessionId, answer_id: answerId } },
          body: { day },
        },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (session) => {
      onSuccess(session)
      queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

/** Retirer la révision posée : la séance part du calendrier. */
export function useClearRevision() {
  const queryClient = useQueryClient()
  const onSuccess = useSessionSuccess()
  return useMutation({
    mutationFn: async ({
      sessionId,
      answerId,
    }: {
      sessionId: string
      answerId: string
    }): Promise<RecallSession> => {
      const { data, error, response } = await api.DELETE(
        '/recall-sessions/{session_id}/answers/{answer_id}/revision',
        { params: { path: { session_id: sessionId, answer_id: answerId } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (session) => {
      onSuccess(session)
      queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}
