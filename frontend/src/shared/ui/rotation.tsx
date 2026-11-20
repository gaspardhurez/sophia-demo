import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/utils'

/** Toutes les 8 s, l'élément suivant (#44). */
const ROTATION_MS = 8000

/**
 * Le défilement d'une série affichée **un élément à la fois** : l'index avance
 * tout seul toutes les 8 s ; choisir un élément le montre et **fige** le
 * défilement. Sous deux éléments, rien ne tourne.
 */
export function useRotation(count: number) {
  const [index, setIndex] = useState(0)
  const [frozen, setFrozen] = useState(false)

  useEffect(() => {
    if (count < 2 || frozen) return
    const t = setInterval(() => setIndex((i) => i + 1), ROTATION_MS)
    return () => clearInterval(t)
  }, [count, frozen])

  return {
    current: count > 0 ? index % count : 0,
    choose: (j: number) => {
      setIndex(j)
      setFrozen(true)
    },
  }
}

/**
 * Les points d'une série qui défile : le courant à la couleur passée, les
 * autres gris ; un point grossit au survol, un clic le choisit. Rien sous deux
 * éléments.
 */
export function RotationDots({
  labels,
  current,
  color,
  onChoose,
}: {
  /** Le libellé de chaque élément, pour le lecteur d'écran. */
  labels: string[]
  current: number
  /** La couleur du point courant, en valeur CSS. */
  color: string
  onChoose: (index: number) => void
}) {
  if (labels.length < 2) return null
  return (
    <span className="flex gap-0.5">
      {labels.map((label, j) => (
        <button
          key={j}
          type="button"
          aria-label={label}
          aria-pressed={j === current}
          onClick={() => onChoose(j)}
          className="group/dot grid size-2.5 place-items-center"
        >
          <span
            className={cn(
              'size-1.5 rounded-full transition-transform group-hover/dot:scale-150',
              j !== current && 'bg-border',
            )}
            style={j === current ? { background: color } : undefined}
          />
        </button>
      ))}
    </span>
  )
}
