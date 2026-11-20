import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  NoteQuestion,
  Notes,
  NotesDoc,
  QuestionWrite,
} from '../model/types'

export const noteKeys = {
  root: ['notes'] as const,
  skill: (skillId: string) => ['notes', skillId] as const,
  /** La clé des enregistrements du document : qui écrit le document attend
   *  qu'aucun ne soit en route (`useIsMutating`), pour partir du dernier. */
  save: (skillId: string) => ['notes', skillId, 'save'] as const,
}

/** Les notes d'un savoir. Jamais écrites : un document nul, pas une erreur. */
export function useNotes(skillId: string | undefined) {
  return useQuery({
    queryKey: noteKeys.skill(skillId ?? ''),
    queryFn: async (): Promise<Notes> => {
      const { data, error, response } = await api.GET(
        '/skills/{skill_id}/notes',
        { params: { path: { skill_id: skillId as string } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    enabled: Boolean(skillId),
  })
}

/**
 * Enregistre tout le document d'un bloc. Le serveur ne supprime jamais une
 * question : un nœud absent, il le repose en fin de document.
 */
export function useSaveNotes(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: noteKeys.save(skillId),
    mutationFn: async (doc: NotesDoc): Promise<Notes> => {
      const { data, error, response } = await api.PUT(
        '/skills/{skill_id}/notes',
        { params: { path: { skill_id: skillId } }, body: { doc } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (data) =>
      queryClient.setQueryData(noteKeys.skill(skillId), data),
  })
}

/**
 * Range une question écrite dans le cache, à sa place si elle y est déjà,
 * sinon à la fin : la page la lit sans attendre de relecture.
 */
function putQuestion(
  queryClient: QueryClient,
  skillId: string,
  question: NoteQuestion,
) {
  queryClient.setQueryData<Notes>(noteKeys.skill(skillId), (notes) => {
    if (!notes) return notes
    const at = notes.questions.findIndex((q) => q.id === question.id)
    return {
      ...notes,
      questions:
        at >= 0
          ? notes.questions.with(at, question)
          : [...notes.questions, question],
    }
  })
}

/**
 * Une question du savoir — incomplète au besoin : elle s'écrit ensuite sur
 * place. Sa place dans le texte, c'est le nœud que l'éditeur pose.
 */
export function useCreateQuestion(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: QuestionWrite): Promise<NoteQuestion> => {
      const { data, error, response } = await api.POST(
        '/skills/{skill_id}/note-questions',
        { params: { path: { skill_id: skillId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (question) => putQuestion(queryClient, skillId, question),
  })
}

/** Le cache suit sans relecture : la page en écrit une à chaque pause. */
export function useUpdateQuestion(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: Partial<QuestionWrite>
    }): Promise<NoteQuestion> => {
      const { data, error, response } = await api.PATCH(
        '/note-questions/{question_id}',
        { params: { path: { question_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (question) => putQuestion(queryClient, skillId, question),
  })
}

export function useDeleteQuestion(skillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/note-questions/{question_id}',
        { params: { path: { question_id: id } } },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess: (_, id) =>
      queryClient.setQueryData<Notes>(
        noteKeys.skill(skillId),
        (notes) =>
          notes && {
            ...notes,
            questions: notes.questions.filter((q) => q.id !== id),
          },
      ),
  })
}
