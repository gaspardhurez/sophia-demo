import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import {
  type Notes,
  noteKeys,
  useCreateQuestion,
  useSaveNotes,
} from '@/entities/note'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import { anchorQuestion } from '../lib/question-sections'
import { toEditorDoc } from './document'

/**
 * « + Question » de « Préparer les questions » (#173) : une question
 * factuelle, en réponse libre, **ancrée dans le document** (#213) au
 * dernier bloc de sa partie — à son titre si elle n'a pas de texte : une
 * question de section. Sans éditeur ouvert, c'est la vue qui écrit le
 * document : la question naît vide au serveur (`POST`, il rend son id), puis
 * le document part d'un bloc avec son ancre (`PUT`).
 *
 * Sécurité des données : le document s'écrit d'un bloc, il remplacerait un
 * enregistrement plus récent. On part donc du dernier état connu (le cache,
 * que chaque `PUT` met à jour) et on n'écrit pas tant qu'un enregistrement
 * est en route — celui que l'éditeur lâche en se démontant, quand on passe
 * des notes à la vue (`busy`).
 *
 * « Écrire la question » d'une idée centrale passe par le même chemin, avec
 * une réponse attendue déjà écrite (le passage de l'idée).
 */
export function useAddQuestion(skillId: string) {
  const queryClient = useQueryClient()
  const create = useCreateQuestion(skillId)
  const saveNotes = useSaveNotes(skillId)
  const saving = useIsMutating({ mutationKey: noteKeys.save(skillId) }) > 0
  const [adding, setAdding] = useState(false)
  // La question qu'on vient d'ajouter prend le curseur, une fois.
  const focusNext = useRef<string | null>(null)

  /** Ajoute une question en `at`, un index au premier rang du document
   *  (`SectionPart.end`), avec sa réponse attendue s'il y en a une ; rend
   *  son id une fois posée dans le document, nul si rien n'a abouti. */
  const add = useCallback(
    async (
      at: number,
      answer: string | null = null,
    ): Promise<string | null> => {
      setAdding(true)
      try {
        const question = await create.mutateAsync({
          kind: 'factual',
          form: 'free',
          prompt: '',
          answer,
          points: [],
        })
        const notes = queryClient.getQueryData<Notes>(noteKeys.skill(skillId))
        if (!notes) return null
        focusNext.current = question.id
        await saveNotes.mutateAsync(
          anchorQuestion(toEditorDoc(notes), at, question.id) as Record<
            string,
            unknown
          >,
        )
        return question.id
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "L'enregistrement a échoué",
        )
        return null
      } finally {
        setAdding(false)
      }
    },
    // `create` et `saveNotes` changent d'identité à chaque rendu ; seul
    // `mutateAsync` sert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, skillId],
  )

  const takeFocus = useCallback((id: string) => {
    if (focusNext.current !== id) return false
    focusNext.current = null
    return true
  }, [])

  return { add, busy: adding || saving, takeFocus } as const
}
