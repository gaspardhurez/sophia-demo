import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'

import { isItem, isList, unitAt } from './block-unit'
import { PARAGRAPH } from './blocks'
import { TEXT_ITEM, TEXT_LIST } from './text-children'

/**
 * Tab sur les premiers éléments d'une liste qui suit une autre liste (relevé
 * de Notion, 12/10) : une puce juste après un élément numéroté — ou l'inverse,
 * ou une tâche — s'imbrique sous lui, comme sous un élément de sa propre liste.
 * Les commandes de liste (`sinkListItem`) n'y voient personne : pour elles,
 * ce sont deux listes.
 *
 * Les éléments `from` à `to` (des positions dans le premier et le dernier,
 * d'une même liste, le premier en tête de liste) partent à la fin du dernier
 * élément de la liste d'avant : dans sa sous-liste du même type s'il finit
 * par une, sinon dans une sous-liste nouvelle. Le reste de leur liste ne
 * bouge pas. Rien si la liste d'avant n'en est pas une, ou si le document ne
 * l'accepte pas.
 *
 * Rend la transaction et la position du premier élément déplacé (les suivants
 * le suivent) ; `shift` : où va une position des éléments déplacés.
 */
export function sinkAcross(
  state: EditorState,
  from: number,
  to = from,
): { tr: Transaction; start: number; shift: (pos: number) => number } | null {
  const { doc } = state
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  let d = $from.depth
  while (d > 1 && !(isItem($from.node(d)) && isList($from.node(d - 1)))) d--
  if (d <= 1 || !isItem($from.node(d))) return null
  const list = $from.node(d - 1)
  if ($from.index(d - 1) !== 0) return null
  // Le dernier élément : dans la même liste.
  if ($to.depth < d || $to.node(d - 1) !== list) return null
  const last = $to.index(d - 1)

  const host = $from.node(d - 2)
  const at = $from.index(d - 2)
  if (at === 0) return null
  const prev = host.child(at - 1)
  const tail = prev.lastChild
  if (!isList(prev) || !tail || !isItem(tail)) return null

  const listStart = $from.before(d - 1)
  const moved: PMNode[] = []
  for (let i = 0; i <= last; i++) moved.push(list.child(i))
  const movedSize = moved.reduce((s, n) => s + n.nodeSize, 0)

  // La fin du contenu du dernier élément d'avant (`listStart` − 2 : avant la
  // fermeture de cet élément et celle de sa liste).
  const tailEnd = listStart - 2
  const inner = tail.lastChild
  const join = !!inner && inner.type === list.type
  const insertAt = join ? tailEnd - 1 : tailEnd
  const content = join ? moved : [list.type.create(list.attrs, moved)]
  if (
    !join &&
    !tail.canReplaceWith(tail.childCount, tail.childCount, list.type)
  )
    return null

  const tr = state.tr
  // D'abord retirer (après le point d'arrivée : ses positions ne bougent pas).
  if (last === list.childCount - 1)
    tr.delete(listStart, listStart + list.nodeSize)
  else tr.delete(listStart + 1, listStart + 1 + movedSize)
  try {
    tr.insert(insertAt, content)
  } catch {
    return null
  }
  // Leur liste vidée, celle d'avant retrouve la suivante : de même sorte,
  // elles n'en font plus qu'une (deux numéros qui se suivent se comptent).
  const next = at + 1 < host.childCount ? host.child(at + 1) : null
  if (last === list.childCount - 1 && next?.type === prev.type)
    tr.join(tr.mapping.map(listStart))
  const start = join ? insertAt : insertAt + 1
  const shift = (pos: number) => pos - (listStart + 1) + start
  return { tr, start, shift }
}

/**
 * ⇧Tab sur des éléments imbriqués sous un élément d'une **autre** sorte de
 * liste (une puce sous un numéro) : ils remontent d'un niveau en gardant
 * leur sorte — Notion ne change jamais le type d'un bloc —, là où les
 * commandes de liste les verseraient dans la liste du parent. Comme elles,
 * les éléments qui les suivaient deviennent leurs enfants. La liste du
 * parent se coupe autour d'eux.
 *
 * Mêmes entrées et sortie que `sinkAcross`. Rien si les deux listes sont de
 * la même sorte (les commandes de liste font bien), ni si la sous-liste
 * n'est pas la fin de son élément.
 */
export function liftAcross(
  state: EditorState,
  from: number,
  to = from,
): { tr: Transaction; start: number; shift: (pos: number) => number } | null {
  const { doc } = state
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  let d = $from.depth
  while (d > 1 && !(isItem($from.node(d)) && isList($from.node(d - 1)))) d--
  if (d < 4 || !isItem($from.node(d))) return null
  const list = $from.node(d - 1)
  const parent = $from.node(d - 2)
  const outer = $from.node(d - 3)
  if (!isItem(parent) || !isList(outer) || outer.type === list.type) return null
  if (parent.lastChild !== list) return null
  if ($to.depth < d || $to.node(d - 1) !== list) return null
  const first = $from.index(d - 1)
  const last = $to.index(d - 1)

  const kids: PMNode[] = []
  list.forEach((n) => kids.push(n))
  const moved = kids.slice(first, last + 1)
  const followers = kids.slice(last + 1)
  // Les suivants deviennent les enfants du dernier élément remonté.
  if (followers.length) {
    const tail = moved[moved.length - 1]
    const inner = tail.lastChild
    const grown =
      inner && inner.type === list.type
        ? tail.copy(
            tail.content.replaceChild(
              tail.childCount - 1,
              inner.copy(inner.content.append(Fragment.from(followers))),
            ),
          )
        : tail.copy(
            tail.content.addToEnd(list.type.create(list.attrs, followers)),
          )
    moved[moved.length - 1] = grown
  }

  const kept = kids.slice(0, first)
  const parentNew = parent.copy(
    kept.length
      ? parent.content.replaceChild(
          parent.childCount - 1,
          list.copy(Fragment.from(kept)),
        )
      : parent.content.cut(0, parent.content.size - list.nodeSize),
  )
  const items: PMNode[] = []
  outer.forEach((n) => items.push(n))
  const at = $from.index(d - 3)
  const before = outer.type.create(outer.attrs, [
    ...items.slice(0, at),
    parentNew,
  ])
  const lifted = list.type.create(list.attrs, moved)
  const after = items.slice(at + 1)
  const parts = [before, lifted]
  if (after.length) parts.push(outer.type.create(outer.attrs, after))

  const outerStart = $from.before(d - 3)
  const tr = state.tr
  try {
    tr.replaceWith(outerStart, outerStart + outer.nodeSize, parts)
  } catch {
    return null
  }
  const runStart =
    $from.before(d - 1) +
    1 +
    kids.slice(0, first).reduce((s, n) => s + n.nodeSize, 0)
  const start = outerStart + before.nodeSize + 1
  const shift = (pos: number) => pos - runStart + start
  return { tr, start, shift }
}

/**
 * Tab sur des blocs qui ne sont pas des éléments (un paragraphe, un code…)
 * juste après une liste (relevé de Notion, 17/11) : ils passent **sous** le
 * dernier élément de cette liste, à la fin de ce qu'il porte déjà (après ses
 * sous-éléments). L'inverse de `liftOutOfItem`. Deux listes de même sorte qui
 * se retrouvent voisines n'en font plus qu'une.
 *
 * `first`, `last` : le début du premier et du dernier bloc, frères dans le
 * même parent. Rien si l'un est une liste ou un élément (les commandes de
 * liste s'en chargent), si le bloc d'avant n'est pas une liste (sous un
 * paragraphe : `sinkUnderParagraph`), ou si l'élément ne les accepte pas.
 *
 * Mêmes sorties que `sinkAcross` ; `shift` : où va une position des blocs.
 */
export function sinkUnderItem(
  state: EditorState,
  first: number,
  last = first,
): { tr: Transaction; start: number; shift: (pos: number) => number } | null {
  const { doc } = state
  const $first = doc.resolve(first)
  const $last = doc.resolve(last)
  if (!$first.sameParent($last)) return null
  const parent = $first.parent
  const i = $first.index()
  const j = $last.index()
  if (i === 0 || j < i) return null
  const prev = parent.child(i - 1)
  const tail = prev.lastChild
  if (!isList(prev) || !tail || !isItem(tail)) return null

  const moved: PMNode[] = []
  let fits = tail.contentMatchAt(tail.childCount)
  for (let k = i; k <= j; k++) {
    const node = parent.child(k)
    if (isList(node) || isItem(node)) return null
    const next = fits.matchType(node.type)
    if (!next) return null
    fits = next
    moved.push(node)
  }
  const end = last + parent.child(j).nodeSize
  // La fin du contenu du dernier élément : avant sa fermeture et celle de sa
  // liste, qui précèdent le premier bloc.
  const tailEnd = first - 2

  const tr = state.tr.delete(first, end)
  tr.insert(tailEnd, moved)
  // Leur liste et la suivante, désormais voisines : une seule si même sorte.
  const after = j + 1 < parent.childCount ? parent.child(j + 1) : null
  if (after?.type === prev.type) tr.join(tr.mapping.map(end))
  const shift = (pos: number) => pos - first + tailEnd
  return { tr, start: tailEnd, shift }
}

/**
 * ⇧Tab (et Retour arrière en tête) sur un bloc **enfant** d'un élément de
 * liste — pas son texte, un bloc rangé sous lui (relevé de Notion, 13/10) :
 * le bloc sort juste après l'élément, au niveau de la liste, et la liste se
 * coupe en deux autour de lui ; l'élément reste un élément. Les blocs qui le
 * suivaient sous l'élément deviennent ses enfants s'il est un paragraphe
 * (Notion, relevé du 18/11) ; sinon (un titre, un code n'ont pas d'enfants)
 * ils sortent avec lui, dans l'ordre.
 *
 * Rien si le curseur n'est pas dans un enfant d'un élément (le premier bloc
 * d'un élément est son texte : les commandes de liste s'en chargent).
 */
export function liftOutOfItem(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from, $to } = state.selection
  // Le bloc du curseur, enfant direct d'un élément de liste.
  let d = $from.depth
  while (d > 1 && !isItem($from.node(d - 1))) d--
  if (d <= 2 || !isItem($from.node(d - 1)) || !isList($from.node(d - 2)))
    return false
  if ($to.pos > $from.end(d - 1)) return false
  const done = liftBlockOut(state, $from.before(d))
  if (!done) return false
  const { tr, shift } = done
  tr.setSelection(TextSelection.near(tr.doc.resolve(shift($from.pos))))
  dispatch?.(tr.scrollIntoView())
  return true
}

/**
 * Le cœur de `liftOutOfItem` : le bloc qui commence en `blockStart`, enfant
 * d'un élément après son texte, sort après l'élément avec ceux qui le
 * suivent. `shift` : où va une position de ces blocs. Rien si le bloc n'est
 * pas un tel enfant.
 */
export function liftBlockOut(
  state: EditorState,
  blockStart: number,
  adopt = true,
): { tr: Transaction; shift: (pos: number) => number } | null {
  const $block = state.doc.resolve(blockStart)
  const d = $block.depth + 1
  const item = $block.parent
  if (d <= 2 || !isItem(item) || !isList($block.node(d - 2))) return null
  if ($block.index() === 0) return null

  const itemEnd = $block.end()
  let moved = state.doc.slice(blockStart, itemEnd).content
  // Un paragraphe sorti adopte ceux qui le suivaient (relevé Notion, 18/11) :
  // ils deviennent ses enfants (cf. `text-children`).
  let inside = 0
  if (adopt && moved.childCount > 1) {
    const wrapped = asParent(state, moved)
    if (wrapped) {
      moved = Fragment.from(wrapped)
      inside = 2
    }
  }
  const listDepth = d - 2
  const list = $block.node(listDepth)
  const last = $block.index(listDepth) === list.childCount - 1

  const tr = state.tr.delete(blockStart, itemEnd)
  // Après l'élément : la fin de la liste s'il était le dernier, sinon la
  // liste se coupe là, et les blocs vont entre les deux moitiés.
  const afterItem = tr.mapping.map($block.after())
  if (!last) tr.split(afterItem, 1)
  const at = afterItem + 1
  tr.insert(at, moved)
  // Le début du bloc devient celui de l'élément qui le porte.
  const shift = (pos: number) =>
    inside && pos === blockStart ? at + 1 : pos - blockStart + at + inside
  return { tr, shift }
}

/**
 * Le paragraphe en tête de `content` porteur des blocs qui le suivent : une
 * liste de texte d'un élément (`textList > textItem`) ; nul si `content` ne
 * commence pas par un paragraphe ou si le schéma refuse ses enfants.
 */
function asParent(state: EditorState, content: Fragment): PMNode | null {
  const { nodes } = state.schema
  if (content.firstChild?.type.name !== PARAGRAPH) return null
  const item = nodes[TEXT_ITEM]
  const list = nodes[TEXT_LIST]
  if (!item || !list || !item.validContent(content)) return null
  return list.create(null, item.create(null, content))
}

/**
 * Tab sur des blocs juste après un **paragraphe** (relevé Notion, 18/11) :
 * ils deviennent ses enfants, à la fin de ce qu'il porte — le paragraphe
 * devient un élément de liste de texte (cf. `text-children`). Des blocs
 * (`first` à `last`, frères) ou les premiers éléments d'une liste (sa tête,
 * jusqu'à `last` ; le reste de la liste ne bouge pas).
 *
 * Rien si le bloc d'avant n'est pas un paragraphe (un titre, un séparateur,
 * un code n'ont pas d'enfants), s'il est le texte de l'élément qui porte les
 * blocs (on ne range pas un bloc sous son propre parent), ou si le schéma
 * refuse. Un paragraphe qui a déjà des enfants est un élément : Tab sous lui
 * passe par `sinkUnderItem`, ou les commandes de liste.
 *
 * Mêmes sorties que `sinkAcross` ; `shift` : où va une position des blocs.
 */
export function sinkUnderParagraph(
  state: EditorState,
  first: number,
  last = first,
): { tr: Transaction; start: number; shift: (pos: number) => number } | null {
  const { doc } = state
  const a = unitAt(doc, first)
  const b = unitAt(doc, last)
  if (!a || !b || !!a.list !== !!b.list) return null
  const $first = doc.resolve(first)
  const $last = doc.resolve(last)
  // Ce qui part (`moved`), d'où (`start`, `end`), et ce qui reste d'une liste.
  let moved: PMNode[]
  let start: number
  let end: number
  let rest: PMNode | null = null
  if (a.list) {
    const list = a.list
    if (b.list !== list || $first.index() !== 0) return null
    const items: PMNode[] = []
    list.forEach((item) => items.push(item))
    const j = $last.index()
    moved = [list.copy(Fragment.from(items.slice(0, j + 1)))]
    const kept = items.slice(j + 1)
    if (kept.length) rest = list.copy(Fragment.from(kept))
    start = $first.before()
    end = start + list.nodeSize
  } else {
    if (!$first.sameParent($last)) return null
    const parent = $first.parent
    const i = $first.index()
    const j = $last.index()
    if (j < i) return null
    moved = []
    for (let k = i; k <= j; k++) {
      const node = parent.child(k)
      if (isList(node) || isItem(node)) return null
      moved.push(node)
    }
    start = first
    end = last + parent.child(j).nodeSize
  }
  const $start = doc.resolve(start)
  const host = $start.parent
  const i = $start.index()
  if (i === 0 || (isItem(host) && i === 1)) return null
  const prev = host.child(i - 1)
  if (prev.type.name !== PARAGRAPH) return null
  const wrapped = asParent(state, Fragment.from([prev, ...moved]))
  if (!wrapped) return null
  const from = start - prev.nodeSize
  const tr = state.tr
  try {
    tr.replaceWith(from, end, rest ? [wrapped, rest] : wrapped)
  } catch {
    return null
  }
  const base = from + 2 + prev.nodeSize
  return { tr, start: base, shift: (pos) => pos - start + base }
}

/**
 * Le paragraphe parent du curseur cesse de l'être : ses enfants remontent à
 * son niveau, juste après lui (sa liste de texte se coupe autour). Le premier
 * temps du Retour arrière en tête d'un parent (relevé Notion, 18/11 : son
 * texte rejoint le bloc d'avant, ses enfants remontent d'un niveau).
 * `itemStart` : le début de l'élément. Rend la transaction et la position du
 * paragraphe libéré.
 */
export function dissolveParent(
  state: EditorState,
  itemStart: number,
): { tr: Transaction; at: number } | null {
  const { doc } = state
  const item = doc.nodeAt(itemStart)
  if (!item || item.type.name !== TEXT_ITEM) return null
  const $item = doc.resolve(itemStart)
  const list = $item.parent
  const index = $item.index()
  const items: PMNode[] = []
  list.forEach((n) => items.push(n))
  const before = items.slice(0, index)
  const after = items.slice(index + 1)
  const freed: PMNode[] = []
  item.forEach((n) => freed.push(n))
  const parts = [
    ...(before.length ? [list.copy(Fragment.from(before))] : []),
    ...freed,
    ...(after.length ? [list.copy(Fragment.from(after))] : []),
  ]
  const listStart = $item.before()
  const tr = state.tr
  try {
    tr.replaceWith(listStart, listStart + list.nodeSize, parts)
  } catch {
    return null
  }
  const at =
    listStart + (before.length ? list.copy(Fragment.from(before)).nodeSize : 0)
  return { tr, at }
}
