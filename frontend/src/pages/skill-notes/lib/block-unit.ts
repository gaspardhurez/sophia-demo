import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, NodeSelection } from '@tiptap/pm/state'

import { BODY_CONTAINERS, LIST_ITEM_OF } from './blocks'

/**
 * Le **bloc manipulable** (design #90, à la Notion) : ce que la poignée, la
 * sélection de blocs, le rectangle, le glisser et le menu de bloc prennent
 * pour un bloc. C'est
 * - un enfant d'un conteneur de blocs (`BODY_CONTAINERS` : le document, une
 *   colonne, un menu dépliant, un encadré), sauf une liste ;
 * - un **élément de liste** (`listItem`, `taskItem`), à toute profondeur :
 *   chez Notion, chaque élément est un bloc. La liste n'est qu'une enveloppe
 *   — le document, lui, ne change pas (`bulletList > listItem > paragraph`) ;
 * - un enfant d'un élément, après son texte (un sous-élément, ou un autre
 *   bloc imbriqué sous lui : un titre, un paragraphe…), comme les blocs
 *   enfants de Notion.
 *
 * Un élément emporte ce qu'il contient : ses sous-éléments le suivent.
 *
 * Les blocs se rangent en **suites** (`Flow`) : les blocs d'un même niveau,
 * dans l'ordre. La suite d'un conteneur de blocs y met ses enfants, chaque
 * liste remplacée par ses éléments ; celle d'un élément, ses enfants après
 * son texte, de même. La sélection de blocs, ⌘⇧↑/↓, ⌘D vivent dans une suite :
 * des éléments voisins et les blocs hors liste qui les entourent.
 */
export interface Unit {
  pos: number
  node: PMNode
  /** La liste d'un élément ; nul hors liste. */
  list: PMNode | null
}

/** Le nœud est-il une liste (ses éléments sont des blocs) ? */
export const isList = (node: PMNode) => LIST_ITEM_OF.has(node.type.name)

// Calculé au premier usage, pas au chargement : le registre des blocs importe
// ce module en retour (dépendance circulaire), `LIST_ITEM_OF` n'y est pas
// encore initialisé quand ce module se charge.
let items: Set<string> | null = null

/** Le nœud est-il un élément de liste ? */
export const isItem = (node: PMNode) =>
  (items ??= new Set([...LIST_ITEM_OF.values()].map((l) => l.item))).has(
    node.type.name,
  )

/** La zone du marqueur à gauche du texte d'un élément (0 hors liste). */
export function markerOf(list: PMNode | null): number {
  return (list && LIST_ITEM_OF.get(list.type.name)?.marker) ?? 0
}

/** Le bloc qui commence en `pos`, s'il en est un. */
export function unitAt(doc: PMNode, pos: number): Unit | null {
  if (pos < 0 || pos >= doc.content.size) return null
  const node = doc.nodeAt(pos)
  if (!node) return null
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  if (BODY_CONTAINERS.has(parent.type.name))
    return isList(node) ? null : { pos, node, list: null }
  // Un enfant d'un élément, après son texte.
  if (isItem(parent) && $pos.index() > 0 && !isList(node))
    return unitAt(doc, $pos.before()) ? { pos, node, list: null } : null
  if (!isItem(node) || !isList(parent) || $pos.depth < 1) return null
  // La liste vit dans un conteneur de blocs, ou dans un élément qui est un
  // bloc (pas dans une citation).
  const host = $pos.node($pos.depth - 1)
  const ok =
    BODY_CONTAINERS.has(host.type.name) ||
    (isItem(host) && !!unitAt(doc, $pos.before($pos.depth - 1)))
  return ok ? { pos, node, list: parent } : null
}

/** Le bloc le plus profond qui contient `$pos`. */
export function unitAround($pos: ResolvedPos): Unit | null {
  const doc = $pos.doc
  for (let d = $pos.depth; d > 0; d--) {
    const unit = unitAt(doc, $pos.before(d))
    if (unit) return unit
  }
  return null
}

/** Le bloc de la sélection : le nœud sélectionné, ou celui du curseur. */
export function unitOfSelection(state: EditorState): Unit | null {
  const { selection } = state
  if (selection instanceof NodeSelection) {
    const found = unitAt(state.doc, selection.from)
    if (found) return found
  }
  return unitAround(selection.$from)
}

/** Une suite : les blocs d'un même niveau, dans l'ordre. */
export interface Flow {
  /** Ce qui les porte : un conteneur de blocs, ou un élément. */
  host: PMNode
  /** Le début du contenu de `host`. */
  start: number
  units: Unit[]
}

/** Les blocs de la suite de `host` (son contenu commence en `start`). */
export function flowIn(host: PMNode, start: number): Unit[] {
  const out: Unit[] = []
  const inItem = isItem(host)
  host.forEach((child, offset, index) => {
    const pos = start + offset
    // Le texte d'un élément n'est pas un bloc : il est l'élément.
    if (inItem && index === 0) return
    if (isList(child))
      child.forEach((item, o) =>
        out.push({ pos: pos + 1 + o, node: item, list: child }),
      )
    else out.push({ pos, node: child, list: null })
  })
  return out
}

/** La suite du bloc qui commence en `pos`. */
export function flowOf(doc: PMNode, pos: number): Flow | null {
  const unit = unitAt(doc, pos)
  if (!unit) return null
  const $pos = doc.resolve(pos)
  const depth = unit.list ? $pos.depth - 1 : $pos.depth
  const host = $pos.node(depth)
  const start = $pos.start(depth)
  return { host, start, units: flowIn(host, start) }
}

/** Les blocs en `a` et `b` sont-ils d'une même suite ? */
export function sameFlow(doc: PMNode, a: number, b: number): boolean {
  const fa = flowOf(doc, a)
  return !!fa && fa.start === flowOf(doc, b)?.start
}

/**
 * Les blocs de la suite de `host` et, sous chaque élément, ses sous-éléments :
 * l'ordre de lecture (↑/↓ d'un bloc au suivant).
 */
export function deepIn(host: PMNode, start: number): Unit[] {
  return flowIn(host, start).flatMap((u) =>
    isItem(u.node) ? [u, ...deepIn(u.node, u.pos + 1)] : [u],
  )
}

/** La suite du conteneur de blocs (pas d'un élément) où vit le bloc `pos`. */
export function bodyFlowOf(doc: PMNode, pos: number): Flow | null {
  let flow = flowOf(doc, pos)
  while (flow && isItem(flow.host)) flow = flowOf(doc, flow.start - 1)
  return flow
}

/**
 * Le texte propre d'un bloc : celui d'un élément est son premier paragraphe
 * (sans ses sous-éléments) ; sinon, tout son contenu.
 */
export function ownRange(unit: Unit): { from: number; to: number } {
  const first = unit.node.firstChild
  if (unit.list && first?.isTextblock)
    return { from: unit.pos + 2, to: unit.pos + 2 + first.content.size }
  return { from: unit.pos + 1, to: unit.pos + unit.node.nodeSize - 1 }
}
