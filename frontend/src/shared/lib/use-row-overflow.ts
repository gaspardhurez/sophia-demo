import { useCallback, useRef, useState } from 'react'

export interface RowOverflow {
  /** Les enfants passés sous la première ligne. */
  hidden: number
  /** La hauteur de tout le contenu, lignes repliées comprises. */
  height: number
  /** Le texte de chaque enfant caché, pour le nommer (« +n » au survol). */
  labels: string[]
}

/**
 * Ce qui déborde d'une rangée **qui passe à la ligne** (`flex-wrap`) mais
 * qu'on montre sur une seule ligne (hauteur bornée, `overflow: hidden`) :
 * combien d'enfants sont tombés sous la première, et la hauteur qu'il faudrait
 * pour tout montrer. On mesure la vraie ligne plutôt que d'estimer des
 * largeurs de texte.
 *
 * Suivi au redimensionnement de la rangée et au changement de ses enfants (des
 * chips qui arrivent avec leurs données). Comme `useElementWidth`, rend une
 * **ref de rappel**.
 */
export function useRowOverflow<T extends HTMLElement>(): [
  (node: T | null) => void,
  RowOverflow,
] {
  const [state, setState] = useState<RowOverflow>({
    hidden: 0,
    height: 0,
    labels: [],
  })
  const cleanup = useRef<(() => void) | null>(null)

  const ref = useCallback((node: T | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!node) return
    const measure = () => {
      const kids = Array.from(node.children) as HTMLElement[]
      const top = kids[0]?.offsetTop ?? 0
      const below = kids.filter((k) => k.offsetTop > top + 2)
      const next = {
        hidden: below.length,
        height: node.scrollHeight,
        labels: below.map((k) => (k.textContent ?? '').trim()),
      }
      setState((s) =>
        s.height === next.height && s.labels.join('|') === next.labels.join('|')
          ? s
          : next,
      )
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(node)
    const mutation = new MutationObserver(measure)
    mutation.observe(node, { childList: true, subtree: true })
    cleanup.current = () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [])

  return [ref, state]
}
