/** L'écart entre deux cartes de la marge (`prod/Notes` : 8 px). */
export const CARD_GAP = 8

/** Une carte à placer : la hauteur de son ancre et sa propre hauteur. */
export interface CardBox {
  id: string
  /** Le haut de son passage, dans le repère de la marge. */
  anchor: number
  height: number
}

/**
 * La place des cartes dans la marge, **comme un document partagé**
 * (`prod/Notes`, `placer`) : chaque carte au niveau de son passage ; la
 * carte **active** exactement à sa hauteur, les autres s'écartent — celles
 * d'en dessous poussées vers le bas, celles d'au-dessus remontées — pour ne
 * jamais se chevaucher. Rien ne monte au-dessus de `floor` (le haut de la
 * marge, ou le bas des commentaires sans passage) : tout descend alors
 * d'autant.
 *
 * Sans carte active, c'est la première qui tient sa place. Rend le haut de
 * chaque carte, et le bas de la dernière (la hauteur que la marge doit
 * réserver).
 */
export function placeCards(
  cards: CardBox[],
  activeId: string | null,
  floor = 0,
): { tops: Map<string, number>; bottom: number } {
  const tops = new Map<string, number>()
  if (!cards.length) return { tops, bottom: floor }
  const sorted = [...cards].sort((a, b) => a.anchor - b.anchor)
  const pivot = Math.max(
    0,
    sorted.findIndex((c) => c.id === activeId),
  )
  const top: number[] = []
  top[pivot] = sorted[pivot].anchor
  for (let i = pivot + 1; i < sorted.length; i++)
    top[i] = Math.max(
      sorted[i].anchor,
      top[i - 1] + sorted[i - 1].height + CARD_GAP,
    )
  for (let i = pivot - 1; i >= 0; i--)
    top[i] = Math.min(
      sorted[i].anchor,
      top[i + 1] - sorted[i].height - CARD_GAP,
    )
  const shift = Math.max(0, floor - Math.min(...top))
  let bottom = floor
  sorted.forEach((c, i) => {
    tops.set(c.id, top[i] + shift)
    bottom = Math.max(bottom, top[i] + shift + c.height)
  })
  return { tops, bottom }
}
