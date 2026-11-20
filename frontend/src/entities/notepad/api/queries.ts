import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { Notepad } from '../model/types'

export const notepadKeys = { root: ['notepad'] as const }

export function useNotepad() {
  return useQuery({
    queryKey: notepadKeys.root,
    queryFn: async (): Promise<Notepad> => {
      const { data, error, response } = await api.GET('/notepad')
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

export function useSaveNotepad() {
  const queryClient = useQueryClient()

  return useMutation({
    // Sans effet sur la vue d'ensemble de l'apprentissage.
    meta: { overview: false },
    mutationFn: async (content: string): Promise<Notepad> => {
      const { data, error, response } = await api.PUT('/notepad', {
        body: { content },
      })
      if (error) throw toApiError(error, response)
      return data
    },
    // Le serveur vient de renvoyer l'état exact : on le pose dans le cache au
    // lieu d'invalider. Invalider relancerait une lecture qui, pendant qu'on
    // tape, peut revenir après la frappe suivante et écraser le champ.
    onSuccess: (pad) => queryClient.setQueryData(notepadKeys.root, pad),
  })
}
