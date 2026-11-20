import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type PasteReason,
  reviewFailure,
  useRunReview,
} from '@/entities/review'
import { ApiError } from '@/shared/api'

/**
 * Où en est la vérification des notes d'une ressource (`prod/Notes`, états
 * de « Vérifier les notes ») :
 * - `idle` : le bouton, « Vérifier les notes » ou « Vérifier à nouveau » ;
 * - `running` : « Je relis la source… » (ou « Je relis le passage… ») ;
 * - `paste` : la source n'a pas pu être lue — le champ « Colle le
 *   passage », **à ce moment-là seulement** ; `error`, un passage refusé
 *   (trop long), rendu dans le champ (`draft`) pour être raccourci ;
 * - `nothing` : la vérification n'a rien relevé — « Rien d'important ne
 *   manque. » ;
 * - `failed` : un échec dit en clair ; `retry`, s'il se relance d'ici.
 */
export type ReviewStep =
  | { step: 'idle' }
  | { step: 'running'; pasted: boolean }
  | {
      step: 'paste'
      reason: PasteReason
      error: string | null
      draft: string
    }
  | { step: 'nothing' }
  | { step: 'failed'; message: string; retry: boolean }

/**
 * Vérifier les notes d'une ressource (#173, `prod/Notes`) : rien ne se lance
 * tout seul. Les notes partent d'abord (`flush`) — le serveur relit ce
 * qu'on voit, et l'extrait de chaque commentaire se retrouve dans le
 * document affiché. Puis `POST /resources/{id}/review` :
 *
 * - des commentaires : ils rejoignent la marge, le premier **actif** (aligné
 *   sur son passage, comme la maquette au retour d'une vérification) ;
 * - aucun : « Rien d'important ne manque. » ;
 * - `needs_paste` : le champ à coller ; « Vérifier » relance avec le
 *   passage, « Annuler » le referme ;
 * - un échec : son message, et « Réessayer » s'il a un recours — le même
 *   appel, passage collé compris.
 *
 * Quitter la ressource abandonne l'attente : une réponse tardive rejoint
 * quand même le cache (les commentaires restent au serveur), sans rien
 * montrer ici.
 */
export function useReview({
  resourceId,
  flush,
  onComments,
}: {
  resourceId: string
  /** Envoie les notes qui attendent ; `false` si l'envoi échoue. */
  flush: () => Promise<boolean>
  /** Les nouveaux commentaires sont là : la marge active le premier. */
  onComments: (ids: string[]) => void
}) {
  const [state, setState] = useState<ReviewStep>({ step: 'idle' })
  const { mutateAsync: run } = useRunReview()
  // Le dernier passage collé, pour « Réessayer » après un échec.
  const lastPasted = useRef<string | undefined>(undefined)
  // Pourquoi la source n'a pas pu être lue : le champ garde son motif.
  const pasteReason = useRef<PasteReason | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const onCommentsRef = useRef(onComments)
  useEffect(() => {
    onCommentsRef.current = onComments
  }, [onComments])

  const send = useCallback(
    async (pastedText?: string) => {
      lastPasted.current = pastedText
      setState({ step: 'running', pasted: !!pastedText })
      if (!(await flush())) {
        if (alive.current)
          setState({
            step: 'failed',
            message:
              'Les notes ne se sont pas enregistrées : rien n’est parti à Sophia.',
            retry: true,
          })
        return
      }
      try {
        const result = await run({ resourceId, pastedText })
        if (!alive.current) return
        if (result.needs_paste && result.paste_reason) {
          pasteReason.current = result.paste_reason
          setState({
            step: 'paste',
            reason: result.paste_reason,
            error: null,
            draft: '',
          })
        } else if (!result.comments.length) setState({ step: 'nothing' })
        else {
          setState({ step: 'idle' })
          onCommentsRef.current(result.comments.map((c) => c.id))
        }
      } catch (err) {
        if (!alive.current) return
        const failure = reviewFailure(err)
        // Un passage collé refusé (trop long, 422) : on reste au champ, le
        // message dessous, pour coller moins.
        if (pastedText && err instanceof ApiError && err.status === 422)
          setState({
            step: 'paste',
            reason: pasteReason.current ?? 'unreachable',
            error: failure.message,
            draft: pastedText,
          })
        else setState({ step: 'failed', ...failure })
      }
    },
    [flush, run, resourceId],
  )

  const start = useCallback(() => void send(), [send])
  const submitPaste = useCallback(
    (text: string) => {
      const pasted = text.trim()
      if (pasted) void send(pasted)
    },
    [send],
  )
  const retry = useCallback(() => void send(lastPasted.current), [send])
  const dismiss = useCallback(() => setState({ step: 'idle' }), [])

  return {
    state,
    /** Relit ou attend un passage : on ne relance pas par-dessus. */
    busy: state.step === 'running' || state.step === 'paste',
    start,
    submitPaste,
    retry,
    dismiss,
  }
}
