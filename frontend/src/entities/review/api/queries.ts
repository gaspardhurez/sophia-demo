import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api, toApiError } from '@/shared/api'

import type { ReviewComment, ReviewRun, ReviewStatus } from '../model/types'

export const reviewKeys = {
  comments: (resourceId: string) => ['review-comments', resourceId] as const,
}

/**
 * Un 503 dit que Sophia n'est plus disponible : l'état du compagnon se
 * relit, et ses actions se grisent avec leur motif. Clé écrite à plat :
 * deux entités ne s'importent pas (`entities/companion`).
 */
const COMPANION_STATUS = ['companion'] as const

/**
 * Les commentaires de Sophia sur les notes d'une ressource, **ouverts et
 * résolus** (résolu = archivé : il reste, replié), du plus ancien au plus
 * récent, chacun avec son fil. Ils restent d'une visite à l'autre tant
 * qu'on ne les supprime pas (#173, décision du 29/10).
 */
export function useReviewComments(resourceId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.comments(resourceId ?? ''),
    queryFn: async (): Promise<ReviewComment[]> => {
      const { data, error, response } = await api.GET(
        '/resources/{resource_id}/review-comments',
        { params: { path: { resource_id: resourceId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(resourceId),
  })
}

/**
 * Vérifier les notes d'une ressource contre la ressource. Le serveur lit la
 * source sur le moment ; s'il n'y arrive pas, rien n'est vérifié et la
 * réponse demande de coller le passage (`needs_paste`) — le second appel
 * le porte (`pastedText`). Les **nouveaux** commentaires s'ajoutent à ceux
 * qui restent : « Vérifier à nouveau » n'efface rien.
 */
export function useRunReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      resourceId,
      pastedText,
    }: {
      resourceId: string
      pastedText?: string
    }): Promise<ReviewRun> => {
      const { data, error, response } = await api.POST(
        '/resources/{resource_id}/review',
        {
          params: { path: { resource_id: resourceId } },
          body: { pasted_text: pastedText ?? null },
        },
      )
      if (error || !data) throw toApiError(error, response)
      return data
    },
    onSuccess: (run, { resourceId }) => {
      if (!run.comments.length) return
      const known = new Set(
        queryClient
          .getQueryData<ReviewComment[]>(reviewKeys.comments(resourceId))
          ?.map((c) => c.id),
      )
      queryClient.setQueryData<ReviewComment[]>(
        reviewKeys.comments(resourceId),
        (list) => [
          ...(list ?? []),
          ...run.comments.filter((c) => !known.has(c.id)),
        ],
      )
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 503)
        queryClient.invalidateQueries({ queryKey: COMPANION_STATUS })
    },
  })
}

/**
 * Le cache des commentaires d'une ressource suit **avant** la réponse —
 * résoudre replie la carte sous le doigt, supprimer l'ôte. Un échec rend
 * l'état d'avant (l'appelant le dit).
 */
function useCommentsCache<V>(
  resourceId: string,
  patch: (comments: ReviewComment[], vars: V) => ReviewComment[],
) {
  const queryClient = useQueryClient()
  const key = reviewKeys.comments(resourceId)
  return {
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<ReviewComment[]>(key)
      queryClient.setQueryData<ReviewComment[]>(key, (list) =>
        list ? patch(list, vars) : list,
      )
      return { before }
    },
    onError: (
      _err: unknown,
      _vars: V,
      context: { before?: ReviewComment[] } | undefined,
    ) => {
      if (context?.before) queryClient.setQueryData(key, context.before)
    },
  }
}

/** Résoudre (`resolved` : archivé, replié en « Résolu · type ») ou rouvrir. */
export function useSetReviewStatus(resourceId: string) {
  const queryClient = useQueryClient()
  const cache = useCommentsCache<{ commentId: string; status: ReviewStatus }>(
    resourceId,
    (list, { commentId, status }) =>
      list.map((c) => (c.id === commentId ? { ...c, status } : c)),
  )
  return useMutation({
    mutationFn: async ({
      commentId,
      status,
    }: {
      commentId: string
      status: ReviewStatus
    }): Promise<ReviewComment> => {
      const { data, error, response } = await api.PATCH(
        '/review-comments/{comment_id}',
        { params: { path: { comment_id: commentId } }, body: { status } },
      )
      if (error || !data) throw toApiError(error, response)
      return data
    },
    ...cache,
    onSuccess: (comment) =>
      queryClient.setQueryData<ReviewComment[]>(
        reviewKeys.comments(resourceId),
        (list) => list?.map((c) => (c.id === comment.id ? comment : c)),
      ),
  })
}

/** Supprimer un commentaire : lui et son fil disparaissent. */
export function useDeleteReviewComment(resourceId: string) {
  const cache = useCommentsCache<string>(resourceId, (list, commentId) =>
    list.filter((c) => c.id !== commentId),
  )
  return useMutation({
    mutationFn: async (commentId: string): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/review-comments/{comment_id}',
        { params: { path: { comment_id: commentId } } },
      )
      if (error) throw toApiError(error, response)
    },
    ...cache,
  })
}

/**
 * Répondre sous un commentaire : la réponse est enregistrée, puis **Sophia
 * répond dans le fil** ; le serveur rend le commentaire avec tout son fil.
 *
 * Si Sophia échoue (502), ta réponse est déjà enregistrée : la liste se
 * relit pour la montrer. Indisponible (503) : rien n'est enregistré, et
 * l'état du compagnon se relit.
 */
export function useReplyToReviewComment(resourceId: string) {
  const queryClient = useQueryClient()
  const key = reviewKeys.comments(resourceId)
  return useMutation({
    mutationFn: async ({
      commentId,
      body,
    }: {
      commentId: string
      body: string
    }): Promise<ReviewComment> => {
      const { data, error, response } = await api.POST(
        '/review-comments/{comment_id}/replies',
        { params: { path: { comment_id: commentId } }, body: { body } },
      )
      if (error || !data) throw toApiError(error, response)
      return data
    },
    onSuccess: (comment) =>
      queryClient.setQueryData<ReviewComment[]>(key, (list) =>
        list?.map((c) => (c.id === comment.id ? comment : c)),
      ),
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      if (error.status === 502) queryClient.invalidateQueries({ queryKey: key })
      if (error.status === 503)
        queryClient.invalidateQueries({ queryKey: COMPANION_STATUS })
    },
  })
}
