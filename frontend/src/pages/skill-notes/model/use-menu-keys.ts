import { type RefObject, useEffect, useRef } from 'react'

/**
 * Les touches du menu passent avant l'éditeur : écoute en capture, sur
 * l'élément qui le contient. `handler` peut changer à chaque rendu.
 */
export function useMenuKeys(
  area: RefObject<HTMLElement | null>,
  handler: (e: KeyboardEvent) => void,
) {
  const keys = useRef(handler)
  keys.current = handler
  useEffect(() => {
    const root = area.current
    if (!root) return
    const down = (e: KeyboardEvent) => keys.current(e)
    root.addEventListener('keydown', down, true)
    return () => root.removeEventListener('keydown', down, true)
  }, [area])
}
