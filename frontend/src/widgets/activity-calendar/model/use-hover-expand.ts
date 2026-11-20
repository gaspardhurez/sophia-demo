import { useEffect, useRef, useState } from 'react'

/**
 * Le bloc survolé passe en pleine largeur (design #55), sans délai — sauf
 * `delay` (celui qui en porte d'autres, `HOST_REVEAL_DELAY`). Rien ne se
 * déplie pendant un glisser ou un redimensionnement — le bloc changerait de
 * largeur sous le pointeur.
 */
export function useHoverExpand(disabled: boolean) {
  const [hovered, setHovered] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    hovered: disabled ? null : hovered,
    enter: (key: string, delay = 0) => {
      window.clearTimeout(timer.current)
      if (delay > 0)
        timer.current = window.setTimeout(() => setHovered(key), delay)
      else setHovered(key)
    },
    leave: () => {
      window.clearTimeout(timer.current)
      setHovered(null)
    },
  }
}
