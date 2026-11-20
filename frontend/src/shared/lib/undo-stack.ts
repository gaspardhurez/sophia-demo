import { useMemo, useRef } from 'react'

/**
 * Une pile d'annulation (⌘Z) : chaque geste réversible empile son inverse.
 *
 * Le calendrier en tient une à lui ; un écran qui le compose avec d'autres
 * gestes sur les mêmes séances (la préparation de la semaine) lui passe la
 * sienne et y empile aussi — ⌘Z défait alors ce qu'on a fait d'un côté comme
 * de l'autre, dans l'ordre.
 */
export interface UndoStack {
  push: (inverse: () => Promise<void>) => void
  pop: () => (() => Promise<void>) | undefined
}

export function useUndoStack(): UndoStack {
  const stack = useRef<(() => Promise<void>)[]>([])
  return useMemo(
    () => ({
      push: (inverse) => {
        stack.current.push(inverse)
      },
      pop: () => stack.current.pop(),
    }),
    [],
  )
}
