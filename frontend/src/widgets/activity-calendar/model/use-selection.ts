import { useCallback, useMemo, useState } from 'react'

/**
 * La **sélection multiple** du calendrier : les activités qu'un geste
 * (glisser, supprimer, copier) prendra ensemble.
 *
 * Distincte de l'activité dont le panneau est ouvert (`selected` du
 * calendrier) : Maj + clic ferme le panneau, et l'activité qui y était entre
 * dans la sélection. Elle ne garde que des identifiants et survit au
 * changement de semaine — le groupe se glisse au bord vers la suivante.
 */
export function useSelection() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())

  /** Ajoute ou retire `id` ; `also` entre avec lui (l'activité du panneau). */
  const toggle = useCallback((id: string, also?: string) => {
    setIds((cur) => {
      const next = new Set(cur)
      if (also && also !== id) next.add(also)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** Ajoute (le lasso ajoute : Maj est la touche « en plus »). */
  const add = useCallback((more: string[]) => {
    if (more.length === 0) return
    setIds((cur) => new Set([...cur, ...more]))
  }, [])

  const clear = useCallback(() => {
    setIds((cur) => (cur.size === 0 ? cur : new Set()))
  }, [])

  return useMemo(
    () => ({
      ids,
      size: ids.size,
      has: (id: string) => ids.has(id),
      toggle,
      add,
      clear,
    }),
    [ids, toggle, add, clear],
  )
}

export type Selection = ReturnType<typeof useSelection>
