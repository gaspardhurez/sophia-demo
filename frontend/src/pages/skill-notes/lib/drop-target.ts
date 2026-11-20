import type { Node as PMNode } from '@tiptap/pm/model'

import type { Drop } from './block-move'
import { flowIn, isItem, markerOf, type Unit } from './block-unit'
import { BODY_CONTAINERS } from './blocks'
import { CALLOUT } from './callout'
import { COLUMN, COLUMNS } from './columns'

/** Un rectangle à l'écran (coordonnées du client). */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Le rectangle du nœud en `pos`, ou nul s'il n'est pas affiché. */
export type BoxAt = (pos: number) => Box | null

/**
 * Un bloc à l'écran (cf. `block-unit`) : un enfant d'un conteneur de blocs,
 * ou un élément de liste.
 */
export interface BlockHit {
  pos: number
  node: PMNode
  box: Box
  /** Son parent : le document, une colonne, un toggle ouvert, une liste… */
  parent: PMNode
  /** La liste d'un élément ; nul hors liste. */
  list: PMNode | null
}

interface Placed {
  pos: number
  node: PMNode
  box: Box
}

const shown = (box: Box | null): box is Box => !!box && box.bottom > box.top

/** Les blocs affichés d'une suite, avec leur boîte. */
function placed(units: Unit[], boxAt: BoxAt): (Placed & Unit)[] {
  const out: (Placed & Unit)[] = []
  for (const unit of units) {
    const box = boxAt(unit.pos)
    // Un nœud masqué (une question inconnue, un titre replié) ne compte pas.
    if (shown(box)) out.push({ ...unit, box })
  }
  return out
}

const gap = (v: number, a: number, b: number) =>
  v < a ? a - v : v > b ? v - b : 0

function nearest<T extends Placed>(items: T[], d: (box: Box) => number) {
  let best: T | null = null
  let bestD = Infinity
  for (const item of items) {
    const dist = d(item.box)
    if (dist < bestD) {
      best = item
      bestD = dist
    }
  }
  return best
}

/**
 * Les conteneurs de blocs affichés dans `node` (sans descendre dedans) — lui
 * seul s'il en est un (un encadré), sinon ses descendants qui en sont (le
 * contenu d'un toggle, les colonnes).
 */
function containersIn(node: PMNode, pos: number, boxAt: BoxAt): Placed[] {
  if (BODY_CONTAINERS.has(node.type.name)) {
    const box = boxAt(pos)
    return shown(box) ? [{ pos, node, box }] : []
  }
  const out: Placed[] = []
  if (isItem(node)) return out
  node.descendants((child, offset) => {
    if (child.isTextblock || child.isLeaf) return false
    if (!BODY_CONTAINERS.has(child.type.name)) return true
    const at = pos + 1 + offset
    const box = boxAt(at)
    if (shown(box)) out.push({ pos: at, node: child, box })
    return false
  })
  return out
}

/**
 * Le bloc sous le pointeur : dans le document, le bloc à cette hauteur (le
 * plus proche, entre deux) — une liste comptant pour ses éléments ; s'il
 * contient des conteneurs de blocs, on y descend — dans des colonnes, la
 * colonne la plus proche du pointeur ; ailleurs (un toggle ouvert, un
 * encadré), le conteneur qu'on vise à cette hauteur —, puis son bloc à
 * cette hauteur, et ainsi de suite. Sur un élément, à hauteur de ses
 * sous-éléments : le sous-élément.
 */
export function blockUnder(
  doc: PMNode,
  boxAt: BoxAt,
  x: number,
  y: number,
): BlockHit | null {
  const pick = (container: PMNode, start: number): BlockHit | null => {
    const best = nearest(placed(flowIn(container, start), boxAt), (b) =>
      gap(y, b.top, b.bottom),
    )
    if (!best) return null
    if (isItem(best.node)) {
      const nested = placed(flowIn(best.node, best.pos + 1), boxAt)
      const inside = nested.some((n) => !gap(y, n.box.top, n.box.bottom))
      const hit = inside && pick(best.node, best.pos + 1)
      return hit || { ...best, parent: best.list ?? container }
    }
    const inner = containersIn(best.node, best.pos, boxAt)
    const aimed = nearest(
      best.node.type.name === COLUMNS
        ? inner
        : inner.filter((c) => !gap(y, c.box.top, c.box.bottom)),
      (b) => gap(x, b.left, b.right),
    )
    const hit = aimed && pick(aimed.node, aimed.pos + 1)
    return hit ?? { ...best, parent: container }
  }
  return pick(doc, 0)
}

/**
 * Le bloc des poignées sous le pointeur : celui de `blockUnder`, sauf le
 * premier bloc d'un encadré (ou le premier élément de sa première liste).
 * Sa ligne est celle de l'encadré — chez Notion, son texte — : les poignées
 * vont à l'encadré, hors de la boîte, au lieu de couvrir son icône.
 */
export function handleHit(
  doc: PMNode,
  boxAt: BoxAt,
  x: number,
  y: number,
): BlockHit | null {
  let hit = blockUnder(doc, boxAt, x, y)
  while (hit) {
    let $pos = doc.resolve(hit.pos)
    if (hit.list) {
      if ($pos.index() !== 0) break
      $pos = doc.resolve($pos.before())
    }
    if ($pos.parent.type.name !== CALLOUT || $pos.index() !== 0) break
    const pos = $pos.before()
    const box = boxAt(pos)
    if (!box) break
    // Un encadré premier bloc d'un encadré : on remonte encore.
    hit = { pos, node: $pos.parent, box, parent: $pos.node(-1), list: null }
  }
  return hit
}

/**
 * La boîte d'un bloc à l'écran, depuis son bord gauche de bloc : un élément
 * de liste commence à son marqueur (la puce, le numéro), pas à son texte.
 */
export function blockBox(hit: { box: Box; list: PMNode | null }): Box {
  // Champ par champ : une boîte du DOM (`DOMRect`) ne s'étale pas.
  const { left, right, top, bottom } = hit.box
  return { left: left - markerOf(hit.list), right, top, bottom }
}

/** Ce que montre l'arrivée : un trait horizontal ou vertical, de 4 px. */
export interface DropMark {
  left: number
  top: number
  width: number
  height: number
}

/** L'épaisseur du trait d'arrivée (Notion : 4 px). */
const LINE = 4
/**
 * Ce qui ouvre une colonne, relevé de Notion (12/10, bloc de 720 px) : jamais
 * le bloc lui-même — sur toute sa largeur, on vise une ligne —, mais sa marge.
 * À gauche, au-delà de la poignée (plus de 24 px du bloc) ; à droite, passé
 * 64 px de son bord. Dans une colonne, l'espace entre les colonnes.
 */
const LEFT_OUT = 24
const RIGHT_OUT = 64

/** Le repère peut-il ouvrir (ou ajouter) une colonne à côté de lui ? */
function lateral(hit: BlockHit): boolean {
  if (hit.parent.type.name === COLUMN) return true
  const columns = hit.parent.type.schema.nodes[COLUMNS]
  if (!columns) return false
  let index = -1
  hit.parent.forEach((child, _, i) => {
    if (child === hit.node) index = i
  })
  return index >= 0 && hit.parent.canReplaceWith(index, index + 1, columns)
}

/**
 * La place où lâcher ce qu'on glisse, le pointeur en (`x`, `y`), et son
 * repère à l'écran (relevé de Notion) : un trait horizontal sur toute la
 * largeur du bloc visé, au-dessus (haut − 4) ou au-dessous (bas) selon la
 * moitié visée ; dans la marge du bloc, à gauche ou à droite (cf.
 * `LEFT_OUT`, `RIGHT_OUT`), un trait vertical de sa hauteur — à 8 px à
 * gauche, 4 px à droite —, si une colonne peut s'ouvrir là.
 */
export function dropTarget(
  doc: PMNode,
  boxAt: BoxAt,
  x: number,
  y: number,
): { drop: Drop; mark: DropMark } | null {
  const hit = blockUnder(doc, boxAt, x, y)
  if (!hit) return null
  const { node } = hit
  const box = blockBox(hit)
  const width = box.right - box.left

  // Un élément qui a des sous-éléments : sous la moitié de sa ligne, on
  // vise le haut du premier d'entre eux (il devient le premier enfant).
  if (isItem(node)) {
    const line = boxAt(hit.pos + 1)
    const [first] = placed(flowIn(node, hit.pos + 1), boxAt)
    if (line && first && y >= (line.top + line.bottom) / 2) {
      const at = blockBox(first)
      return {
        drop: { side: 'before', ref: first.node },
        mark: {
          left: at.left,
          top: at.top - LINE,
          width: at.right - at.left,
          height: LINE,
        },
      }
    }
  }
  const inColumn = hit.parent.type.name === COLUMN
  const side =
    x > box.right + (inColumn ? 0 : RIGHT_OUT)
      ? 'right'
      : x < box.left - (inColumn ? 0 : LEFT_OUT)
        ? 'left'
        : null

  if (side && lateral(hit))
    return {
      drop: { side, ref: node },
      mark: {
        left: side === 'left' ? box.left - 2 * LINE : box.right + LINE,
        top: box.top,
        width: LINE,
        height: box.bottom - box.top,
      },
    }

  const above = y < (box.top + box.bottom) / 2
  return {
    drop: { side: above ? 'before' : 'after', ref: node },
    mark: {
      left: box.left,
      top: above ? box.top - LINE : box.bottom,
      width,
      height: LINE,
    },
  }
}
