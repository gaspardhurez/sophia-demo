import { useEffect, useRef, useState } from 'react'

import {
  type Box,
  boxOf,
  isLasso,
  type Point,
  shiftBox,
  touches,
} from './lasso'

/**
 * Le **lasso** : Maj + glisser sur le fond de la grille horaire tire un
 * rectangle, et les blocs qu'il touche entrent dans la sélection.
 *
 * Le rectangle vit dans les coordonnées du conteneur de la grille (`gridRef`),
 * qui défile avec elle : il reste accroché aux heures pendant le geste. Les
 * blocs touchés se lisent au DOM (`[data-activity-block]`), à leur place
 * réelle — colonnes de chevauchement comprises —, et se montrent sélectionnés
 * **pendant** le geste (`pending`) ; ils rejoignent la sélection au relâcher.
 */
export function useLasso({
  gridRef,
  eligible,
  onEnd,
}: {
  gridRef: React.RefObject<HTMLDivElement | null>
  /** Un bloc sélectionnable (pas figé par un focus). */
  eligible: (id: string) => boolean
  onEnd: (ids: string[]) => void
}) {
  const [origin, setOrigin] = useState<Point | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  // Les rappels changent à chaque rendu : on lit les derniers.
  const latest = useRef({ eligible, onEnd })
  useEffect(() => {
    latest.current = { eligible, onEnd }
  })

  /** Le point du pointeur dans le conteneur. */
  function local(e: { clientX: number; clientY: number }): Point | null {
    const r = gridRef.current?.getBoundingClientRect()
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null
  }

  function start(e: React.PointerEvent) {
    const p = local(e)
    if (!p) return
    e.preventDefault()
    setOrigin(p)
    setBox(boxOf(p, p))
  }

  useEffect(() => {
    if (!origin) return
    function hits(b: Box): Set<string> {
      const grid = gridRef.current
      const out = new Set<string>()
      if (!grid || !isLasso(b)) return out
      const r = grid.getBoundingClientRect()
      const onScreen = shiftBox(b, r.left, r.top)
      grid
        .querySelectorAll<HTMLElement>('[data-activity-block]')
        .forEach((el) => {
          const id = el.dataset.activityId
          if (!id || !latest.current.eligible(id)) return
          if (touches(onScreen, el.getBoundingClientRect())) out.add(id)
        })
      return out
    }
    function onMove(e: PointerEvent) {
      const p = local(e)
      if (!p) return
      const b = boxOf(origin!, p)
      setBox(b)
      setPending(hits(b))
    }
    function onUp(e: PointerEvent) {
      const p = local(e)
      const found = p ? hits(boxOf(origin!, p)) : new Set<string>()
      setOrigin(null)
      setBox(null)
      setPending(new Set())
      latest.current.onEnd([...found])
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // `local` ne lit que `gridRef` : le geste se rebranche au seul départ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin])

  return {
    /** Le rectangle à dessiner (coordonnées du conteneur), `null` hors geste. */
    box: box && isLasso(box) ? box : null,
    pending,
    start,
  }
}
