import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'

import { type Flow, flowOf, isItem, isList, type Unit } from './block-unit'
import { LIST_ITEM_OF, PARAGRAPH } from './blocks'
import { COLUMN, sharedOut } from './columns'
import { QUESTION, questionIds } from './question-node'

/**
 * Ce que la sélection de blocs fait à des blocs d'une même suite (cf.
 * `block-unit`) — supprimer, dupliquer, déplacer, mettre en liste, sortir de
 * la liste —, sans le DOM.
 *
 * La méthode : le contenu de ce qui porte la suite est **éclaté** en une
 * file d'entrées — chaque liste remplacée par ses éléments, chacun gardant
 * sa liste d'origine (`wrap`) —, l'opération réordonne la file, puis la file
 * est **recousue** : des éléments voisins de listes du même type se
 * regroupent en une liste (une liste coupée par un autre bloc devient deux
 * listes du même type ; une liste intacte reste le même nœud). Un élément garde donc toujours le type
 * de sa liste : glissé ou déplacé hors d'elle, il forme une liste d'un
 * élément, comme le bloc à puces de Notion reste un bloc à puces.
 */
export interface Entry {
  node: PMNode
  /** La liste de l'élément ; nul hors liste. */
  wrap: PMNode | null
  /** La position d'origine, pour les blocs (pas le texte d'un élément). */
  pos: number | null
}

/** Le contenu de `flow.host`, éclaté. */
export function explode(flow: Flow): Entry[] {
  const out: Entry[] = []
  const inItem = isItem(flow.host)
  flow.host.forEach((child, offset, index) => {
    const pos = flow.start + offset
    if (isList(child))
      child.forEach((item, o) =>
        out.push({ node: item, wrap: child, pos: pos + 1 + o }),
      )
    // Le texte d'un élément reste en tête : ce n'est pas un bloc.
    else
      out.push({ node: child, wrap: null, pos: inItem && !index ? null : pos })
  })
  return out
}

/**
 * La file recousue : le nouveau contenu de `host`, et où commence chaque
 * entrée (décalage dans ce contenu). Des éléments voisins de listes du même
 * type ne font qu'une liste (chez Notion, des puces voisines sont une même
 * liste, et des numéros voisins se suivent) ; elle garde les attributs de la
 * première (le début d'une numérotée). Nul si le contenu n'est pas permis.
 */
export function implode(
  host: PMNode,
  entries: Entry[],
): { children: PMNode[]; at: number[] } | null {
  const groups: { wrap: PMNode | null; idx: number[] }[] = []
  entries.forEach((e, i) => {
    const g = groups[groups.length - 1]
    if (e.wrap && g?.wrap && e.wrap.type === g.wrap.type) g.idx.push(i)
    else groups.push({ wrap: e.wrap, idx: [i] })
  })
  const children: PMNode[] = []
  const at: number[] = []
  let offset = 0
  for (const { wrap, idx } of groups) {
    if (!wrap) {
      const node = entries[idx[0]].node
      at[idx[0]] = offset
      children.push(node)
      offset += node.nodeSize
      continue
    }
    const nodes = idx.map((i) => entries[i].node)
    // Une liste intacte reste le même nœud.
    const same =
      wrap.childCount === nodes.length &&
      nodes.every((n, k) => wrap.child(k) === n)
    const list = same
      ? wrap
      : wrap.type.create(wrap.attrs, Fragment.from(nodes), wrap.marks)
    let inner = offset + 1
    idx.forEach((i) => {
      at[i] = inner
      inner += entries[i].node.nodeSize
    })
    children.push(list)
    offset += list.nodeSize
  }
  // Un conteneur vidé garde une ligne vide.
  if (!children.length) {
    const paragraph = host.type.schema.nodes[PARAGRAPH]
    if (paragraph) children.push(paragraph.create())
  }
  if (!host.type.validContent(Fragment.from(children))) return null
  return { children, at }
}

/**
 * Remplace les enfants `old` (contenu commençant en `start`) par `next`, en
 * ne touchant que ce qui change : les nœuds identiques en tête et en queue
 * restent en place.
 */
export function replaceChildren(
  tr: Transaction,
  start: number,
  old: PMNode[],
  next: PMNode[],
) {
  let p = 0
  while (p < old.length && p < next.length && old[p] === next[p]) p++
  let s = 0
  while (
    s < old.length - p &&
    s < next.length - p &&
    old[old.length - 1 - s] === next[next.length - 1 - s]
  )
    s++
  let from = start
  for (let i = 0; i < p; i++) from += old[i].nodeSize
  let to = from
  for (let i = p; i < old.length - s; i++) to += old[i].nodeSize
  tr.replaceWith(from, to, Fragment.from(next.slice(p, next.length - s)))
}

const kids = (node: PMNode) => {
  const out: PMNode[] = []
  node.forEach((child) => out.push(child))
  return out
}

/** Le résultat d'une opération : la transaction, et les blocs visés après. */
export interface Edited {
  tr: Transaction
  /** Les positions, après, des blocs que l'opération désigne (dans l'ordre). */
  at: number[]
}

/**
 * Recoud `entries` dans la suite `flow` sur `tr` ; `keep` : les entrées dont
 * on veut la position après.
 */
function apply(
  tr: Transaction,
  flow: Flow,
  entries: Entry[],
  keep: Entry[],
): Edited | null {
  const built = implode(flow.host, entries)
  if (!built) return null
  replaceChildren(tr, flow.start, kids(flow.host), built.children)
  return {
    tr,
    at: keep.map((e) => flow.start + built.at[entries.indexOf(e)]),
  }
}

/** Les blocs `units` d'une même suite : leur suite et leurs entrées. */
function locate(doc: PMNode, units: Unit[]) {
  if (!units.length) return null
  const flow = flowOf(doc, units[0].pos)
  if (!flow) return null
  const entries = explode(flow)
  const wanted = new Set(units.map((u) => u.pos))
  const chosen = entries.filter((e) => e.pos !== null && wanted.has(e.pos))
  if (chosen.length !== units.length) return null
  return { flow, entries, chosen }
}

/** Le bloc porte-t-il une question (lui-même, ou en lui) ? */
export const holdsQuestion = (node: PMNode) =>
  node.type.name === QUESTION || questionIds(node).length > 0

/**
 * Supprime les blocs, sauf ceux qui portent une question (jamais au
 * clavier) ; une liste vidée disparaît. `at` : les blocs restés (les
 * questions). Nul si rien ne part.
 */
export function deleteUnits(
  state: EditorState,
  units: Unit[],
): (Edited & { caret: number }) | null {
  const found = locate(state.doc, units)
  if (!found) return null
  const { flow, entries, chosen } = found
  const gone = new Set(chosen.filter((e) => !holdsQuestion(e.node)))
  if (!gone.size) return null
  const first = entries.findIndex((e) => gone.has(e))
  const rest = entries.filter((e) => !gone.has(e))
  // Le dernier bloc d'une colonne : la colonne disparaît (règle du glisser,
  // cf. `block-move`).
  if (!rest.length && flow.host.type.name === COLUMN)
    return dropColumn(state, flow)
  const kept = chosen.filter((e) => !gone.has(e))
  // Le curseur ira en fin du bloc d'avant (ou en tête de ce qui reste).
  const before = entries
    .slice(0, first)
    .filter((e) => !gone.has(e))
    .pop()
  const done = apply(state.tr, flow, rest, before ? [...kept, before] : kept)
  if (!done) return null
  const caret = before
    ? done.at[done.at.length - 1] + before.node.nodeSize
    : flow.start
  return { tr: done.tr, at: done.at.slice(0, kept.length), caret }
}

/**
 * Une colonne vidée disparaît : les autres gardent leurs proportions ; des
 * colonnes réduites à une seule rendent ses blocs à la page, à leur place. Le
 * curseur va au début de ce qui la remplace.
 */
export function dropColumn(
  state: EditorState,
  flow: Pick<Flow, 'host' | 'start'>,
): Edited & { caret: number } {
  // Juste avant la colonne : on est dans ses colonnes.
  const $col = state.doc.resolve(flow.start - 1)
  const columns = $col.parent
  const at = $col.before()
  const others: PMNode[] = []
  columns.forEach((c) => {
    if (c !== flow.host) others.push(c)
  })
  const replacement =
    others.length === 1
      ? kids(others[0])
      : [columns.copy(Fragment.from(sharedOut(others)))]
  const tr = state.tr.replaceWith(at, at + columns.nodeSize, replacement)
  return { tr, at: [], caret: at + 1 }
}

/** Une copie profonde (aucun nœud partagé avec l'original). */
const copyOf = (node: PMNode) => node.type.schema.nodeFromJSON(node.toJSON())

/**
 * Duplique les blocs juste après le dernier ; une question ne se double pas.
 * Les éléments copiés restent dans leur liste. `at` : les copies.
 */
export function duplicateUnits(
  state: EditorState,
  units: Unit[],
): Edited | null {
  const found = locate(state.doc, units)
  if (!found) return null
  const { flow, entries, chosen } = found
  const copies = chosen
    .filter((e) => !holdsQuestion(e.node))
    .map((e) => ({ ...e, node: copyOf(e.node), pos: null }))
  if (!copies.length) return null
  const last = entries.indexOf(chosen[chosen.length - 1])
  const next = [
    ...entries.slice(0, last + 1),
    ...copies,
    ...entries.slice(last + 1),
  ]
  return apply(state.tr, flow, next, copies)
}

/**
 * ⌘⇧↑ / ⌘⇧↓ : les blocs passent par-dessus leur voisin de suite — au bord
 * d'une liste, hors d'elle (ils gardent leur type, comme chez Notion). `at` :
 * les blocs déplacés. Nul au bout de la suite.
 */
export function moveUnits(
  state: EditorState,
  units: Unit[],
  dir: -1 | 1,
): Edited | null {
  const found = locate(state.doc, units)
  if (!found) return null
  const { flow, entries, chosen } = found
  const unitsOf = flow.units.map((u) => u.pos)
  const first = unitsOf.indexOf(chosen[0].pos!)
  const last = unitsOf.indexOf(chosen[chosen.length - 1].pos!)
  const other = unitsOf[dir < 0 ? first - 1 : last + 1]
  if (other === undefined) return null
  const rest = entries.filter((e) => !chosen.includes(e))
  const k = rest.findIndex((e) => e.pos === other)
  const at = dir < 0 ? k : k + 1
  const next = [...rest.slice(0, at), ...chosen, ...rest.slice(at)]
  return apply(state.tr, flow, next, chosen)
}

/**
 * « Transformer en » une liste (`listName`), à la Notion : chaque bloc
 * devient un élément de ce type, à sa place — un élément d'une autre liste
 * coupe la sienne autour de lui ; voisins, ils se regroupent, et rejoignent
 * une liste voisine du même type. `'same'` : ils en sont déjà tous ; nul :
 * un bloc qui n'est ni un élément ni du texte (citation, encadré…), à
 * transformer à l'ancienne.
 */
export function listUnits(
  state: EditorState,
  units: Unit[],
  listName: string,
): Edited | 'same' | null {
  const { schema } = state
  const spec = LIST_ITEM_OF.get(listName)
  const listType = schema.nodes[listName]
  const itemType = spec && schema.nodes[spec.item]
  const paragraph = schema.nodes[PARAGRAPH]
  if (!listType || !itemType || !paragraph) return null
  if (units.every((u) => u.list?.type === listType)) return 'same'
  const found = locate(state.doc, units)
  if (!found) return null
  const { flow, entries, chosen } = found
  const wrap = listType.create()
  const turned: Entry[] = []
  for (const e of chosen) {
    let node: PMNode
    if (e.wrap?.type === listType) node = e.node
    else if (isItem(e.node))
      node =
        e.node.type === itemType
          ? e.node
          : itemType.create(null, e.node.content, e.node.marks)
    else if (e.node.isTextblock)
      node = itemType.create(null, paragraph.create(null, e.node.content))
    else return null
    turned.push({
      node,
      wrap: e.wrap?.type === listType ? e.wrap : wrap,
      pos: e.pos,
    })
  }
  const next = entries.map((e) => {
    const i = chosen.indexOf(e)
    return i >= 0 ? turned[i] : e
  })
  return apply(state.tr, flow, next, turned)
}

/**
 * Les éléments de `units` sortent de leur liste, à leur place : chacun
 * devient son paragraphe, ses sous-éléments le suivent en liste (la sienne
 * est coupée autour de lui). `at` : la position, après, de chaque bloc de
 * `units` (le paragraphe pour un élément). Rien à faire : nul.
 */
export function unwrapItems(tr: Transaction, units: Unit[]): Edited | null {
  if (!units.some((u) => u.list)) return null
  const found = locate(tr.doc, units)
  if (!found) return null
  const { flow, entries, chosen } = found
  const heads: Entry[] = []
  const next = entries.flatMap((e) => {
    if (!chosen.includes(e) || !e.wrap) {
      if (chosen.includes(e)) heads.push(e)
      return [e]
    }
    const parts = kids(e.node)
    const head: Entry = { node: parts[0], wrap: null, pos: null }
    heads.push(head)
    return [
      head,
      ...parts.slice(1).flatMap((child): Entry[] =>
        isList(child)
          ? kids(child).map((item) => ({
              node: item,
              wrap: child,
              pos: null,
            }))
          : [{ node: child, wrap: null, pos: null }],
      ),
    ]
  })
  return apply(tr, flow, next, heads)
}
