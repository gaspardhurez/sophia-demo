import type { WishItem } from './types'

/**
 * Les puces à montrer, en indices dans la liste entière (on écrit dans la
 * vue, on enregistre la liste). Aucun domaine choisi : toutes, dans leur
 * ordre. Des domaines choisis : les leurs — rangées par domaine, dans
 * l'ordre des domaines, dès qu'il y en a plusieurs (#215).
 */
export function visibleWishes(
  items: WishItem[],
  selected: string[],
  domainOrder: string[],
): number[] {
  const indices = items.map((_, i) => i)
  if (selected.length === 0) return indices
  const shown = indices.filter((i) => {
    const d = items[i].domain_id
    return d !== null && selected.includes(d)
  })
  if (selected.length === 1) return shown
  const rank = (i: number) => domainOrder.indexOf(items[i].domain_id ?? '')
  // `sort` est stable : l'ordre de la liste tient dans un même domaine.
  return shown.sort((a, b) => rank(a) - rank(b))
}
