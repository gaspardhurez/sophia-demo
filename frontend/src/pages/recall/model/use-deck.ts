import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

/** La carte qu'on vient de juger, figée le temps de sa sortie. */
export interface Leaving {
  node: ReactNode
  /** Sue ; ratée ; liste en partie donnée. */
  kind: 'known' | 'missed' | 'partial'
  /** Ce que dit le tampon : ✓, ✕, « 2/3 ». */
  label: string
}

/** Les durées de la maquette (#103) : le tampon se voit, puis la carte sort
 *  — à droite en 420 ms (sue), sous le paquet en ≈ 640 ms sinon. */
const STAMP_MS = { known: 180, missed: 260, partial: 260 }
const EXIT_MS = { known: 440, missed: 640, partial: 640 }

/**
 * Le paquet de la passation : `play` pose le tampon sur la carte jugée et la
 * fait sortir ; la suivante monte quand elle est partie. `busy` tant que ça
 * joue — on ne juge pas deux cartes à la fois.
 */
export function useDeck() {
  const [leaving, setLeaving] = useState<Leaving | null>(null)
  const [exiting, setExiting] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const play = useCallback((card: Leaving) => {
    timers.current.forEach(clearTimeout)
    setLeaving(card)
    setExiting(false)
    const stamp = STAMP_MS[card.kind]
    timers.current = [
      window.setTimeout(() => setExiting(true), stamp),
      window.setTimeout(() => {
        setLeaving(null)
        setExiting(false)
      }, stamp + EXIT_MS[card.kind]),
    ]
  }, [])

  return { leaving, exiting, play, busy: leaving !== null }
}
