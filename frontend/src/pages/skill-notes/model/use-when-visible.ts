import { useEffect, useRef } from 'react'

/**
 * Appelle `onVisible` quand l'élément entre à l'écran (ou s'en approche à
 * 200 px), tant que `enabled` — à chaque entrée : c'est à l'appelant de ne
 * faire les choses qu'une fois. Sert aux suggestions de « Préparer les
 * questions » : une section n'est demandée qu'une fois vue.
 */
export function useWhenVisible<T extends Element>(
  enabled: boolean,
  onVisible: () => void,
) {
  const ref = useRef<T>(null)
  const latest = useRef(onVisible)
  useEffect(() => {
    latest.current = onVisible
  })
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current()
      },
      { rootMargin: '200px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])
  return ref
}
