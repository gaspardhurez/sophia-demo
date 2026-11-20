import { useCallback, useEffect, useRef, useState } from 'react'

import {
  dictationFailure,
  type LiveDictation,
  liveDictationFailure,
  openLiveDictation,
  recorderFailure,
  useCleanDictation,
} from '@/entities/companion'
import { useAudioRecorder } from '@/shared/lib/use-audio-recorder'
import { toast } from '@/shared/ui'

/** Le plafond d'une dictée, comme dans les notes (10 min au serveur, moins
 *  une seconde de marge). */
const MAX_RECORDING_MS = 10 * 60 * 1000 - 1000

/** Où en est la dictée du champ : « Dicter » (micro), « En écoute »
 *  (niveau et Arrêter), « Nettoyage… ». */
export type FieldDictationStep = 'idle' | 'recording' | 'cleaning'

/**
 * La dictée **dans un champ texte** — celui du chat de l'intention (#175,
 * `prod/Cadrer etude - Intention`, états « Dictée dans le champ » et
 * « Nettoyage »). Les mêmes briques que la dictée des notes
 * (`entities/companion` : transcription en direct, nettoyage, messages
 * d'échec ; `shared/lib` : le micro), sans l'éditeur : rien ne s'écrit en
 * gris pendant qu'on parle, et le texte nettoyé — les puces jointes en une
 * phrase — **s'ajoute au champ** (`onText`), à relire avant d'envoyer.
 *
 * Un échec (micro refusé, transcription coupée, nettoyage raté) se dit par
 * un toast et rend le champ : on retape, ou on redicte. Quitter l'écran
 * abandonne la dictée et rend le micro.
 */
export function useFieldDictation(
  skillId: string,
  onText: (text: string) => void,
) {
  const [step, setStep] = useState<FieldDictationStep>('idle')
  const { mutateAsync: clean } = useCleanDictation()
  const live = useRef<LiveDictation | null>(null)
  const alive = useRef(true)
  // Le dernier `onText` : la dictée en cours le lit à son retour.
  const write = useRef(onText)
  useEffect(() => {
    write.current = onText
  }, [onText])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      live.current?.close()
    }
  }, [])

  const fail = useCallback((message: string) => {
    live.current?.close()
    live.current = null
    setStep('idle')
    toast.error(message)
  }, [])

  /** Le texte validé au nettoyage, puis dans le champ. */
  const finish = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) {
        setStep('idle')
        toast('Rien entendu : le micro est coupé ?')
        return
      }
      setStep('cleaning')
      try {
        const { bullets } = await clean({
          skillId,
          resourceId: null,
          transcript,
        })
        if (!alive.current) return
        const text = bullets
          .map((b) => b.trim())
          .filter(Boolean)
          .join(' ')
        if (text) write.current(text)
        else toast('Rien entendu : le micro est coupé ?')
      } catch (err) {
        if (alive.current) toast.error(dictationFailure(err).message)
      } finally {
        if (alive.current) setStep('idle')
      }
    },
    [clean, skillId],
  )

  const recorder = useAudioRecorder({
    maxMs: MAX_RECORDING_MS,
    onChunk: (pcm) => live.current?.send(pcm),
    // La voix est arrêtée : la transcription valide la fin (`onFinal`).
    onEnd: () => {
      if (!live.current) return
      setStep('cleaning')
      live.current.stop()
    },
    onFailure: (failure) => fail(recorderFailure(failure).message),
  })
  const { start: record, stop, cancel } = recorder

  const start = useCallback(() => {
    if (step !== 'idle' || live.current) return
    const session = openLiveDictation({
      skillId,
      resourceId: null,
      onTranscript: () => {},
      onFinal: (text) => {
        live.current = null
        void finish(text)
      },
      onError: (code, detail) => {
        if (live.current !== session) return
        cancel()
        fail(liveDictationFailure(code, detail).message)
      },
    })
    live.current = session
    setStep('recording')
    void record().then((started) => {
      // Le micro ne s'est pas ouvert (`onFailure` l'a dit) : la
      // transcription ouverte pour rien se ferme.
      if (!started && live.current === session) {
        session.close()
        live.current = null
      }
    })
  }, [cancel, fail, finish, record, skillId, step])

  return { step, levels: recorder.levels, start, stop }
}
