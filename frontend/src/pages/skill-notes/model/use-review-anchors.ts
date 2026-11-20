import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ReviewComment } from '@/entities/review'

import {
  installReviewAnchors,
  missingAnchors,
  type ReviewAnchorInput,
  setReviewAnchors,
} from '../lib/review-anchors'

/**
 * Les commentaires de Sophia **ancrés dans l'éditeur** d'une ressource
 * (`lib/review-anchors.ts`) : le plugin est posé une fois, puis reçoit les
 * commentaires et l'actif à chaque changement. Rend les ids dont le
 * passage ne se retrouve plus (texte modifié depuis la vérification) : la
 * marge les montre en tête, « passage introuvable ».
 *
 * Un clic sur un passage surligné ou sur le trait « + » d'un oubli active
 * son commentaire ; un clic ailleurs dans les notes le désactive (on écrit,
 * comme dans un document partagé).
 */
export function useReviewAnchors(
  editor: Editor | null,
  comments: ReviewComment[],
  activeId: string | null,
  onActivate: (id: string | null) => void,
): Set<string> {
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    if (!editor) return
    const remove = installReviewAnchors(editor)
    setInstalled(true)
    return () => {
      setInstalled(false)
      remove()
    }
  }, [editor])

  // La liste du cache ne change d'identité que si un commentaire change.
  const inputs = useMemo<ReviewAnchorInput[]>(
    () =>
      comments.map((c) => ({
        id: c.id,
        anchor: c.anchor,
        quote: c.quote,
        open: c.status === 'open',
      })),
    [comments],
  )
  useEffect(() => {
    if (editor && installed) setReviewAnchors(editor, inputs, activeId)
  }, [editor, installed, inputs, activeId])

  const onActivateRef = useRef(onActivate)
  useEffect(() => {
    onActivateRef.current = onActivate
  }, [onActivate])
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const click = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const hit = target?.closest<HTMLElement>(
        '.review-passage[data-review-anchor], [data-review-gap]',
      )
      onActivateRef.current(
        hit?.dataset.reviewAnchor ?? hit?.dataset.reviewGap ?? null,
      )
    }
    dom.addEventListener('click', click)
    return () => dom.removeEventListener('click', click)
  }, [editor])

  const missing = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? missingAnchors(e) : ''),
  })
  return useMemo(() => new Set(missing ? missing.split(' ') : []), [missing])
}
