import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type DictationRetry,
  dictationFailure,
  type LiveDictation,
  liveDictationFailure,
  openLiveDictation,
  recorderFailure,
  useCleanDictation,
} from '@/entities/companion'
import { useAudioRecorder } from '@/shared/lib/use-audio-recorder'
import { toast } from '@/shared/ui'

import {
  type BlockRange,
  dictationSpot,
  flashDictation,
  insertBullets,
  mapRange,
  removeBlock,
} from '../lib/dictation-block'
import {
  clearDraft,
  draftPos,
  showDraft,
  updateDraft,
} from '../lib/dictation-draft'
import { useDictationAction } from './use-companion-action'

/** Le plafond d'une dictée : celui du serveur (10 min, refusé au-delà),
 *  moins une seconde — l'arrêt n'est pas à la milliseconde, et le serveur
 *  refuse le moindre dépassement. Atteint, la dictée s'arrête et se
 *  nettoie, comme sur « Arrêter ». */
const MAX_RECORDING_MS = 10 * 60 * 1000 - 1000
/** Le temps où « Annuler la dictée » reste offert (`prod/Notes` : 4 s). */
const UNDO_MS = 4000

/**
 * Où en est la dictée (`prod/Notes`, « Dicter ») :
 * - `idle` : « Dicter » ;
 * - `recording` : « Arrêter » (rouge) ; le texte s'écrit **en gris** au
 *   curseur à mesure qu'on parle, et sous les notes, le niveau du micro et
 *   « En écoute » ;
 * - `cleaning` : « Nettoyage… » — la voix est arrêtée, la transcription
 *   finit puis le texte part au nettoyage ;
 * - `placed` : les puces ont remplacé le gris, surlignées un instant, et
 *   « Annuler la dictée » les retire ;
 * - `empty` : rien entendu — « Réessayer » ;
 * - `failed` : un échec dit en clair, et son recours (`retry`).
 */
export type DictationStep =
  | { step: 'idle' }
  | { step: 'recording' }
  | { step: 'cleaning' }
  | { step: 'placed' }
  | { step: 'empty' }
  | { step: 'failed'; message: string; retry: DictationRetry }

/** Un éditeur où l'on peut dicter : les notes du savoir (`resourceId`
 *  nul) ou celles d'une ressource. */
export interface DictationTarget {
  editor: Editor
  resourceId: string | null
}

/**
 * La dictée de la page des notes (#173, décisions du 29/10) — **une** pour
 * la page, que pilotent le « Dicter » de la colonne et celui d'une
 * ressource ouverte.
 *
 * **Au curseur.** Elle écrit dans l'éditeur qui a (ou a eu en dernier) le
 * curseur : les notes du savoir ou celles de la ressource ouverte. Chaque
 * éditeur s'annonce (`useDictationIn`) ; on retient le dernier à avoir eu
 * le focus — cliquer « Dicter » le lui fait perdre, mais ProseMirror garde
 * sa sélection. Aucun éditeur n'a eu de curseur (on arrive sur la page, on
 * prépare les questions) : Dicter est grisé, et dit pourquoi. La place
 * (`dictationSpot`) est prise **au départ** et suit ce qui s'écrit autour ;
 * déplacer le curseur pendant qu'on parle ne la déplace pas.
 *
 * **En direct.** Le micro part en PCM 16 kHz vers la transcription locale
 * (`openLiveDictation`) ; le texte qu'elle rend s'écrit en gris, en
 * décoration (`dictation-draft`) — rien n'entre dans le document. À
 * l'arrêt, le texte validé complet part au nettoyage (`useCleanDictation`)
 * et les puces remplacent le gris, en un bloc surligné un instant.
 * L'éditeur enregistre ensuite comme une frappe : la dictée n'écrit rien
 * côté serveur.
 *
 * - **Annuler la dictée** retire le bloc, suivi à travers ce qui s'écrit
 *   entre-temps ; offert 4 s, ⌘Z le retire aussi ensuite.
 * - **Réessayer** : rien entendu, transcription coupée, micro fermé — une
 *   nouvelle dictée ; nettoyage raté ou serveur muet — **le même texte**
 *   repart (le gris reste affiché en attendant).
 * - L'éditeur de la dictée quitté (une autre vue) l'abandonne et rend le
 *   micro ; pendant le nettoyage, la réponse n'a plus où se poser : un
 *   toast le dit.
 */
export function useDictation(skillId: string | undefined) {
  const [target, setTarget] = useState<DictationTarget | null>(null)
  const [state, setState] = useState<DictationStep>({ step: 'idle' })
  const action = useDictationAction(target !== null)
  const { mutateAsync: clean } = useCleanDictation()

  // La dictée en cours : son éditeur, sa transcription, son texte final
  // (pour le renvoyer tel quel au nettoyage).
  const session = useRef<{
    target: DictationTarget
    live: LiveDictation | null
    transcript: string | null
  } | null>(null)
  const [sessionTarget, setSessionTarget] = useState<DictationTarget | null>(
    null,
  )
  // Le bloc posé, suivi à travers les transactions, pour l'annuler.
  const placed = useRef<BlockRange | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(undoTimer.current)
      session.current?.live?.close()
    }
  }, [])

  // La place du bloc posé suit le document ; s'il disparaît, plus rien à
  // annuler.
  useEffect(() => {
    const editor = sessionTarget?.editor
    if (!editor) return
    const follow = ({ transaction }: { transaction: Transaction }) => {
      if (!placed.current) return
      placed.current = mapRange(placed.current, transaction)
      if (!placed.current)
        setState((s) => (s.step === 'placed' ? { step: 'idle' } : s))
    }
    editor.on('transaction', follow)
    return () => {
      editor.off('transaction', follow)
    }
  }, [sessionTarget])

  const fail = useCallback(
    (
      failure: { message: string; retry: DictationRetry },
      keepDraft = false,
    ) => {
      const s = session.current
      s?.live?.close()
      if (s) s.live = null
      if (s && !keepDraft) clearDraft(s.target.editor)
      setState({ step: 'failed', ...failure })
    },
    [],
  )

  /** Le texte final au nettoyage, puis les puces à la place du gris. */
  const send = useCallback(
    async (transcript: string) => {
      const s = session.current
      if (!s || !skillId) return
      s.transcript = transcript
      const { editor, resourceId } = s.target
      if (!transcript.trim()) {
        clearDraft(editor)
        setState({ step: 'empty' })
        return
      }
      setState({ step: 'cleaning' })
      updateDraft(editor, { cleaning: true })
      try {
        const { bullets } = await clean({ skillId, resourceId, transcript })
        if (!alive.current || session.current !== s || editor.isDestroyed) {
          if (bullets.length)
            toast.error(
              'Les notes ont été quittées : la dictée n’a pas été ajoutée.',
            )
          // Aucune autre dictée n'a pris la suite : on revient au repos.
          if (alive.current && session.current === null)
            setState({ step: 'idle' })
          return
        }
        const at = draftPos(editor) ?? editor.state.doc.content.size
        clearDraft(editor)
        const range = insertBullets(editor, at, bullets)
        if (!range) {
          setState({ step: 'empty' })
          return
        }
        s.transcript = null
        placed.current = range
        flashDictation(editor, range)
        setState({ step: 'placed' })
        window.clearTimeout(undoTimer.current)
        undoTimer.current = window.setTimeout(() => {
          placed.current = null
          setState((st) => (st.step === 'placed' ? { step: 'idle' } : st))
        }, UNDO_MS)
      } catch (err) {
        if (!alive.current || session.current !== s) return
        updateDraft(editor, { cleaning: false })
        fail(dictationFailure(err), true)
      }
    },
    [clean, fail, skillId],
  )

  const recorder = useAudioRecorder({
    maxMs: MAX_RECORDING_MS,
    onChunk: (pcm) => session.current?.live?.send(pcm),
    // La voix est arrêtée (Arrêter, plafond, micro débranché) : la
    // transcription valide la fin et rend le texte (`onFinal`).
    onEnd: () => {
      if (!session.current?.live) return
      setState({ step: 'cleaning' })
      updateDraft(session.current.target.editor, { cleaning: true })
      session.current.live.stop()
    },
    onFailure: (failure) => fail(recorderFailure(failure)),
  })
  const { start: record, stop, cancel } = recorder

  const start = useCallback(() => {
    const t = target
    if (!t || !skillId || !action.available || t.editor.isDestroyed) return
    // Enregistre ou se nettoie : on ne relance pas par-dessus.
    if (session.current?.live || state.step === 'cleaning') return
    // Une nouvelle dictée : la précédente n'est plus à annuler, et son
    // gris éventuel (un nettoyage raté) s'efface.
    window.clearTimeout(undoTimer.current)
    placed.current = null
    if (session.current) clearDraft(session.current.target.editor)

    const { doc, selection } = t.editor.state
    const at = dictationSpot(doc, selection.to) ?? doc.content.size
    showDraft(t.editor, at)
    const s: NonNullable<typeof session.current> = {
      target: t,
      live: null,
      transcript: null,
    }
    s.live = openLiveDictation({
      skillId,
      resourceId: t.resourceId,
      onTranscript: (committed, tentative) =>
        updateDraft(t.editor, { committed, tentative }),
      onFinal: (text) => {
        s.live = null
        void send(text)
      },
      onError: (code, detail) => {
        if (session.current !== s) return
        cancel()
        fail(liveDictationFailure(code, detail))
      },
    })
    session.current = s
    setSessionTarget(t)
    setState({ step: 'recording' })
    void record().then((started) => {
      // Le micro ne s'est pas ouvert : `onFailure` l'a dit ; la
      // transcription ouverte pour rien se ferme.
      if (!started && session.current === s && s.live) {
        s.live.close()
        s.live = null
      }
    })
  }, [
    action.available,
    cancel,
    fail,
    record,
    send,
    skillId,
    state.step,
    target,
  ])

  const retry = useCallback(() => {
    const s = session.current
    if (state.step === 'failed' && state.retry === 'resend' && s?.transcript)
      void send(s.transcript)
    else start()
  }, [send, start, state])

  const undo = useCallback(() => {
    window.clearTimeout(undoTimer.current)
    const range = placed.current
    placed.current = null
    setState({ step: 'idle' })
    const editor = session.current?.target.editor
    if (editor && range && !editor.isDestroyed) {
      removeBlock(editor, range)
      editor.commands.focus()
    }
  }, [])

  const dismiss = useCallback(() => {
    const s = session.current
    if (s) clearDraft(s.target.editor)
    setState({ step: 'idle' })
  }, [])

  /** Un éditeur a pris le focus : c'est là qu'on dictera. */
  const focus = useCallback((t: DictationTarget) => {
    setTarget((prev) =>
      prev?.editor === t.editor && prev.resourceId === t.resourceId ? prev : t,
    )
  }, [])

  /** Un éditeur s'en va (une autre vue) : plus de curseur là ; une dictée
   *  qui y enregistrait s'abandonne. */
  const release = useCallback(
    (editor: Editor) => {
      setTarget((prev) => (prev?.editor === editor ? null : prev))
      const s = session.current
      if (s?.target.editor !== editor) return
      const recording = s.live !== null
      s.live?.close()
      session.current = null
      setSessionTarget(null)
      placed.current = null
      cancel()
      // Pendant le nettoyage, `send` dira par un toast que rien n'est posé.
      if (recording) setState({ step: 'idle' })
      else setState((st) => (st.step === 'cleaning' ? st : { step: 'idle' }))
    },
    [cancel],
  )

  const recording = state.step === 'recording'
  const busy = recording || state.step === 'cleaning'

  return {
    state,
    levels: recorder.levels,
    /** L'éditeur de la dictée en cours (ou de la dernière) : c'est sous
     *  lui que se lit son état. */
    editor: sessionTarget?.editor ?? null,
    /** Dicter est-il possible, et sinon pourquoi (compagnon, curseur). */
    available: action.available,
    reason: action.reason,
    /** Y a-t-il un éditeur où dicter (le motif de la colonne sinon). */
    hasCursor: target !== null,
    busy,
    start,
    stop,
    retry,
    undo,
    dismiss,
    focus,
    release,
  }
}

export type DictationController = ReturnType<typeof useDictation>
