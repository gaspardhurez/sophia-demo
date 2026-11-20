import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, type Transaction } from '@tiptap/pm/state'
import { liftTarget } from '@tiptap/pm/transform'

/**
 * Un bloc de texte qui a des **enfants** (relevé Notion, 18/11/2026 : Tab
 * range n'importe quel bloc sous le paragraphe d'au-dessus). Le document le
 * dit comme un élément de liste sans marqueur : `textList > textItem`,
 * l'élément portant son paragraphe puis ses blocs enfants. Toute la
 * mécanique des éléments (suites de blocs, sélection, glisser, Tab, ⇧Tab)
 * s'y applique donc telle quelle (cf. `block-unit`).
 *
 * Un paragraphe sans enfants s'écrit toujours en paragraphe simple : la
 * normalisation (`normalizeTextChildren`) défait l'élément qui n'en a plus,
 * et réunit deux listes de texte voisines — la liste n'est qu'une enveloppe
 * invisible, rien ne la coupe.
 */
export const TEXT_LIST = 'textList'
export const TEXT_ITEM = 'textItem'
const PARAGRAPH = 'paragraph'

const isTextList = (node: PMNode) => node.type.name === TEXT_LIST

/**
 * Un élément de texte à défaire : sans enfants, ou dont le texte n'est plus
 * un paragraphe (transformé en titre, en code… qui n'ont pas d'enfants).
 */
const undone = (item: PMNode) =>
  item.childCount <= 1 || item.firstChild?.type.name !== PARAGRAPH

/** Les éléments de texte à défaire, les derniers d'abord. */
function undoneItems(doc: PMNode): number[] {
  const found: number[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === TEXT_ITEM && undone(node)) found.push(pos)
    return !node.isTextblock
  })
  return found.reverse()
}

/**
 * La transaction qui remet les listes de texte d'aplomb, ou nul si elles le
 * sont : un élément sans enfants redevient son paragraphe ; un élément dont
 * le texte a changé de type (« Transformer en » titre, `### `…) se défait,
 * ses enfants remontant d'un niveau juste sous lui (relevé Notion, 18/11) ;
 * deux listes de texte voisines n'en font plus qu'une.
 *
 * Par des pas structurels (`lift`, `join`), pas en refaisant la liste : une
 * position dans le texte (le curseur, une sélection de blocs) suit son bloc.
 */
export function normalizeTextChildren(state: EditorState): Transaction | null {
  const tr = state.tr
  // Les derniers d'abord : un élément défait ne décale que ce qui le suit.
  for (const pos of undoneItems(state.doc)) {
    const at = tr.mapping.map(pos)
    const item = tr.doc.nodeAt(at)
    if (!item || item.type.name !== TEXT_ITEM || !undone(item)) continue
    // Son contenu sort de l'élément et de sa liste (qui se coupe autour de
    // lui) : l'élément vide et, au bout, la liste vide disparaissent.
    const $start = tr.doc.resolve(at + 1)
    const $end = tr.doc.resolve(at + 1 + item.content.size)
    const range = $start.blockRange($end)
    const target = range && liftTarget(range)
    if (range && target != null) tr.lift(range, target)
  }
  // Deux listes de texte voisines : une seule (de la fin vers le début).
  const joins: number[] = []
  // `start` : le début du contenu de `parent`.
  const walk = (parent: PMNode, start: number) => {
    let prev: PMNode | null = null
    parent.forEach((child, offset) => {
      if (prev && isTextList(prev) && isTextList(child))
        joins.push(start + offset)
      if (!child.isTextblock && !child.isLeaf) walk(child, start + offset + 1)
      prev = child
    })
  }
  walk(tr.doc, 0)
  for (const pos of joins.sort((a, b) => b - a)) tr.join(pos)
  return tr.docChanged ? tr : null
}

/** La normalisation, après toute transaction qui change le document. */
export const textChildren = Extension.create({
  name: 'textChildren',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (trs, _old, state) =>
          trs.some((tr) => tr.docChanged) ? normalizeTextChildren(state) : null,
      }),
    ]
  },
})
