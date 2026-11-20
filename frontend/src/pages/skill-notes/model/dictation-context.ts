import type { Editor } from '@tiptap/core'
import { createContext, useContext, useEffect } from 'react'

import type { DictationController } from './use-dictation'

/**
 * La dictée de la page (`useDictation`), offerte aux éditeurs qu'elle
 * montre : les notes du savoir, celles d'une ressource. Nulle hors de la
 * page (un éditeur monté ailleurs ne dicte pas).
 */
export const DictationContext = createContext<DictationController | null>(null)

/**
 * Un éditeur où l'on peut dicter : il s'annonce à la dictée de la page
 * quand il prend le focus (ou s'il l'a déjà : l'autofocus d'une page
 * vierge précède l'abonnement), et s'en retire en partant. Rend la dictée,
 * et `here` : est-ce sous cet éditeur que se lit son état.
 */
export function useDictationIn(
  editor: Editor | null,
  resourceId: string | null,
) {
  const dictation = useContext(DictationContext)
  const focus = dictation?.focus
  const release = dictation?.release
  useEffect(() => {
    if (!editor || !focus || !release) return
    const take = () => focus({ editor, resourceId })
    editor.on('focus', take)
    if (editor.isFocused) take()
    return () => {
      editor.off('focus', take)
      release(editor)
    }
  }, [editor, resourceId, focus, release])
  return {
    dictation,
    here: !!editor && dictation?.editor === editor,
  }
}
