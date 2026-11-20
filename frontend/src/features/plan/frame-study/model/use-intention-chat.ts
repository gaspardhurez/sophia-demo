import { useEffect, useRef, useState } from 'react'

import { type IntentionExchange, useFramingIntention } from '@/entities/plan'

/** Une bulle du chat : de Sophia (à gauche), ou une réponse envoyée. */
export interface ChatMessage {
  from: 'sophia' | 'me'
  text: string
}

/** Le mot de la fin, quand Sophia en sait assez (`prod/Cadrer etude -
 *  Intention`, « Sophia a assez »). */
const DONE_LINE = "J'ai ce qu'il me faut. Passe à la suite quand tu veux."

/**
 * Le chat de l'intention (#175, temps 1, avec le compagnon) — tenu par la
 * modale, pour qu'un Retour depuis l'intention formulée le retrouve tel
 * quel.
 *
 * - Il **s'ouvre de lui-même** dès que le compagnon est là : la question
 *   d'ouverture (fixe côté serveur) et ses réponses proposées. La relance
 *   part de l'intention existante (`intention`), envoyée au serveur.
 * - `send` envoie une réponse (pastilles choisies et texte libre, déjà
 *   joints) avec tous les échanges depuis l'ouverture ; Sophia rend
 *   l'intention reformulée (`onIntention`, l'encadré et le brouillon de la
 *   modale) et la question suivante, ou la fin.
 * - Un échec garde l'échange : `retry` renvoie la même demande.
 *
 * Rien ne s'écrit ici : l'intention s'écrit quand on la formule.
 */
export function useIntentionChat({
  planId,
  enabled,
  intention,
  onIntention,
}: {
  planId: string
  /** Le compagnon peut poser ses questions. */
  enabled: boolean
  /** L'intention de l'écran (celle du cycle à la relance). */
  intention: string
  onIntention: (text: string) => void
}) {
  const { mutateAsync: ask } = useFramingIntention(planId)
  // L'attente se tient ici, pas par `isPending` ni les rappels de `mutate` :
  // l'ouverture part dans un effet, et le double montage de StrictMode
  // détache l'observateur de la mutation en cours — elle aboutissait sans
  // que l'écran le sache, les trois points tournaient sans fin.
  const [waiting, setWaiting] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [turns, setTurns] = useState<IntentionExchange[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  const last = useRef<{
    turns: IntentionExchange[]
    intention: string | null
  } | null>(null)

  function request(body: {
    turns: IntentionExchange[]
    intention: string | null
  }) {
    last.current = body
    setFailed(false)
    setSuggestions([])
    setWaiting(true)
    ask(body)
      .then((reply) => {
        // À l'ouverture, l'intention revient telle qu'envoyée : rien à
        // reformuler.
        if (body.turns.length && reply.intention) onIntention(reply.intention)
        if (reply.done || !reply.question) {
          setDone(true)
          setQuestion(null)
          setMessages((m) => [...m, { from: 'sophia', text: DONE_LINE }])
          return
        }
        setQuestion(reply.question)
        setSuggestions(reply.suggestions)
        setMessages((m) => [...m, { from: 'sophia', text: reply.question! }])
      })
      .catch(() => setFailed(true))
      .finally(() => setWaiting(false))
  }

  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    request({ turns: [], intention: intention.trim() || null })
    // Une seule ouverture, à l'arrivée du compagnon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  /** Envoyer une réponse à la question posée. */
  function send(answer: string) {
    const text = answer.trim()
    if (!text || !question || done || waiting) return
    const next = [...turns, { question, answer: text }]
    setTurns(next)
    setQuestion(null)
    setMessages((m) => [...m, { from: 'me', text }])
    request({ turns: next, intention: intention.trim() || null })
  }

  return {
    messages,
    suggestions,
    /** Sophia écrit (les trois points). */
    waiting,
    failed,
    done,
    /** Une question attend sa réponse : le champ est ouvert. */
    open: question !== null && !waiting && !failed,
    /** Au moins une réponse envoyée. */
    answered: turns.length > 0,
    send,
    retry: () => last.current && request(last.current),
  }
}

export type IntentionChat = ReturnType<typeof useIntentionChat>
