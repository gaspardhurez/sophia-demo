import type { Node as PMNode } from '@tiptap/pm/model'

import { flowIn, isItem, type Unit } from './block-unit'
import { COLUMNS } from './columns'
import { blockBox, type Box, type BoxAt } from './drop-target'

/** Les blocs qu'un rectangle sélectionne : du bloc `anchor` au bloc `head`. */
export interface MarqueeRange {
  anchor: number
  head: number
}

const crosses = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Les blocs de la suite de `host` que `rect` touche. */
function touched(host: PMNode, start: number, boxAt: BoxAt, rect: Box) {
  return flowIn(host, start).filter((unit) => {
    const box = boxAt(unit.pos)
    // Un nœud masqué (une question inconnue) ne compte pas ; un élément de
    // liste compte depuis sa puce.
    return (
      !!box &&
      box.bottom > box.top &&
      crosses(blockBox({ box, list: unit.list }), rect)
    )
  })
}

/**
 * Le rectangle ne touche qu'un bloc, qui en porte d'autres : les blocs qu'il
 * touche dedans, s'il faut y descendre — dans des colonnes dont il ne touche
 * qu'une ; sous un élément de liste dont il ne touche pas la ligne, ses
 * sous-éléments. Sinon nul.
 */
function inside(only: Unit, boxAt: BoxAt, rect: Box): Unit[] | null {
  const { pos, node } = only
  if (node.type.name === COLUMNS) {
    const columns: Unit[] = []
    node.forEach((column, offset) => {
      const at = pos + 1 + offset
      const box = boxAt(at)
      if (box && crosses(box, rect))
        columns.push({ pos: at, node: column, list: null })
    })
    if (columns.length !== 1) return null
    const inner = touched(columns[0].node, columns[0].pos + 1, boxAt, rect)
    return inner.length ? inner : null
  }
  if (isItem(node)) {
    const line = boxAt(pos + 1)
    if (line && crosses(line, rect)) return null
    const inner = touched(node, pos + 1, boxAt, rect)
    return inner.length ? inner : null
  }
  return null
}

/**
 * Les blocs que le rectangle `rect` (coordonnées du client) sélectionne,
 * à la Notion : tous ceux qu'il touche, sur toute leur boîte (marge haute
 * comprise). La sélection de blocs de Sophia vit dans une seule suite et
 * d'un seul tenant (cf. `block-unit`) : ce sont les blocs du document
 * touchés — chaque élément d'une liste en est un —, du premier au dernier ;
 * sauf un rectangle qui ne touche qu'un bloc qui en porte d'autres : des
 * colonnes dont il ne touche qu'une (les blocs de cette colonne), un élément
 * dont il ne touche que les sous-éléments (ces sous-éléments). Un encadré ou
 * un menu dépliant se sélectionne entier (Notion y ajoute ses blocs touchés).
 *
 * `up` : le geste remonte — l'ancre (le bout que ⇧↑/⇧↓ ne bougent pas) est
 * le dernier bloc, là où le geste a commencé.
 */
export function marqueeRange(
  doc: PMNode,
  boxAt: BoxAt,
  rect: Box,
  up: boolean,
): MarqueeRange | null {
  let blocks = touched(doc, 0, boxAt, rect)
  while (blocks.length === 1) {
    const inner = inside(blocks[0], boxAt, rect)
    if (!inner) break
    blocks = inner
  }
  if (!blocks.length) return null
  const first = blocks[0].pos
  const last = blocks[blocks.length - 1].pos
  return up ? { anchor: last, head: first } : { anchor: first, head: last }
}
