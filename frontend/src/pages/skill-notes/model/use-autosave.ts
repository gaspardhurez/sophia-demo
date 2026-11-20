import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useSaveNotes } from '@/entities/note'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

/** Ce que la barre en dit (notes d'une ressource ; cf. `NotesEditor`). */
export const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Enregistré',
  pending: 'Enregistrement…',
  saving: 'Enregistrement…',
  error: "Échec de l'enregistrement",
}

const DELAY = 700

/**
 * L'enregistrement au fil de la saisie (design #88 : « tout s'enregistre au
 * fil de la saisie »). Une frappe arme un délai ; à son terme, le document part
 * d'un bloc, tel quel. Un seul envoi à la fois : ce qui change pendant un envoi
 * repart juste après, dans son dernier état.
 *
 * Sécurité des données : l'envoi ne supprime jamais une question au serveur
 * (un nœud absent y est reposé en fin de document) ; côté éditeur, la garde
 * des questions (`questionGuard`) refuse déjà toute transaction qui en perd
 * une.
 */
export function useAutosave(editor: Editor | null, skillId: string) {
  const save = useSaveNotes(skillId)
  return useDocAutosave(editor, save.mutateAsync)
}

/** Ce qu'envoie l'enregistrement : le document entier, en JSON. */
export type SaveDoc = (doc: Record<string, unknown>) => Promise<unknown>

/**
 * Le mécanisme de `useAutosave`, sans savoir où part le document : les notes
 * d'un savoir, ou celles d'une ressource (#173), s'enregistrent de la même
 * façon — même délai, un envoi à la fois, l'attente envoyée au démontage,
 * l'avertissement en quittant.
 */
export function useDocAutosave(editor: Editor | null, save: SaveDoc) {
  // Lu au moment de l'envoi : l'identité de `save` peut changer d'un rendu à
  // l'autre sans relancer l'abonnement à l'éditeur.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])
  const [status, setStatus] = useState<SaveStatus>('saved')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inFlight = useRef<Promise<void> | null>(null)
  const dirty = useRef(false)
  // Le dernier envoi a échoué : `flush` le dit.
  const failed = useRef(false)
  // Le dernier état du document : il survit à l'éditeur, détruit au démontage.
  const latest = useRef(editor?.state.doc)

  const send = useCallback((): Promise<void> => {
    if (!editor) return Promise.resolve()
    // Un envoi en cours repartira de lui-même s'il reste du nouveau.
    if (inFlight.current) return inFlight.current
    dirty.current = false
    setStatus('saving')
    const run = (async () => {
      try {
        const doc = (latest.current ?? editor.state.doc).toJSON() as Record<
          string,
          unknown
        >
        await saveRef.current(doc)
      } catch {
        inFlight.current = null
        failed.current = true
        setStatus('error')
        return
      }
      inFlight.current = null
      failed.current = false
      if (dirty.current) await send()
      else setStatus('saved')
    })()
    inFlight.current = run
    return run
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const onUpdate = ({
      transaction,
    }: {
      transaction: { docChanged: boolean }
    }) => {
      if (!transaction.docChanged) return
      latest.current = editor.state.doc
      dirty.current = true
      setStatus('pending')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void send(), DELAY)
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
      clearTimeout(timer.current)
      // On quitte la page (un lien du fil, une autre page) : ce qui attend
      // part tout de suite plutôt que de se perdre.
      if (dirty.current) void send()
    }
  }, [editor, send])

  // Quitter la page avec une frappe pas encore partie : le navigateur prévient.
  useEffect(() => {
    if (status === 'saved') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  /**
   * Envoie tout de suite ce qui attend, et attend que ce soit parti : ce que
   * le serveur relit ensuite (la vérification des notes d'une ressource)
   * doit être ce qu'on voit, pas l'état d'il y a 0,7 s. Rend `false` si
   * l'envoi a échoué.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current)
    if (dirty.current || inFlight.current) await send()
    return !failed.current
  }, [send])

  return { status, flush }
}
