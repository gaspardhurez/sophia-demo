import { type ChainedCommands, CommandManager, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import { liftTarget } from '@tiptap/pm/transform'

import { type Block, reselect, selectBlocks, selectOn } from './block-selection'
import { ownRange } from './block-unit'
import {
  BODY_CONTAINERS,
  type BlockItem,
  blockOfNode,
  PARAGRAPH,
  specOfItem,
  TABLE,
  TURN_INTO_ITEMS,
} from './blocks'
import { COLUMNS } from './columns'
import { applyColor, type ColorKind, type NoteColor } from './marks'
import { QUESTION } from './question-node'
import { TEXT_LIST } from './text-children'
import { listUnits, unwrapItems } from './unit-edit'

/**
 * Ce que le menu de bloc fait aux blocs sélectionnés (annexe §2) :
 * « Transformer en » et « Couleur », appliqués au texte propre des blocs
 * (celui d'un élément de liste, sans ses sous-éléments) ; les blocs restent
 * sélectionnés.
 */

/** Le texte des blocs, du premier au texte propre du dernier. */
function textRange(doc: PMNode, blocks: Block[]) {
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  return TextSelection.between(
    doc.resolve(first.pos + 1),
    doc.resolve(ownRange(last).to),
  )
}

/** Une chaîne de commandes sur `tr`, qui n'envoie rien d'elle-même. */
function chainOn(editor: Editor, tr: Transaction): ChainedCommands {
  return new CommandManager({ editor }).createChain(tr)
}

/**
 * Les blocs qu'on peut transformer ou colorer : ceux qui ont du texte — pas
 * un tableau (Notion ne le propose pas dans son menu de bloc).
 */
export const canTurn = (blocks: Block[]) =>
  blocks.length > 0 &&
  blocks.every(
    (b) =>
      b.node.type.name !== QUESTION &&
      b.node.type.name !== COLUMNS &&
      b.node.type.name !== TABLE &&
      !b.node.isAtom &&
      (b.node.isTextblock || b.node.content.size > 0),
  )

/**
 * Les blocs de texte de la sélection rendus à du texte simple, hors des
 * listes et citations — le `clearNodes` de TipTap, sauf qu'un bloc ne sort
 * jamais de son conteneur de page (encadré, menu dépliant, colonne) : il y
 * reste, transformé.
 */
export function clearBlocks(chain: ChainedCommands): ChainedCommands {
  return chain.command(({ tr }) => {
    const { $from, $to } = tr.selection
    const doc = tr.doc
    const start = tr.steps.length
    const map = (pos: number) => tr.mapping.slice(start).map(pos)
    doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.isText) return
      const $a = tr.doc.resolve(map(pos))
      const range = $a.blockRange(tr.doc.resolve(map(pos + node.nodeSize)))
      if (!range) return
      if (node.isTextblock) {
        const { defaultType } = $a.parent.contentMatchAt($a.index())
        tr.setNodeMarkup(range.start, defaultType)
      }
      if (BODY_CONTAINERS.has(range.parent.type.name)) return
      const target = liftTarget(range)
      if (target !== null) tr.lift(range, target)
    })
    return true
  })
}

/**
 * Les blocs deviennent `item`. Vers une liste, chaque bloc devient un
 * élément à sa place (`listUnits` : un élément d'une autre liste coupe la
 * sienne autour de lui, comme chez Notion où seul le bloc change). Sinon,
 * les éléments sortent d'abord de leur liste, à leur place (`unwrapItems` :
 * la liste est coupée, leurs sous-éléments les suivent) ; puis tout est
 * rendu à du texte simple (hors des listes et citations, `clearBlocks`) et
 * l'entrée appliquée — un élément devient un titre, un titre une liste.
 */
export function turnInto(editor: Editor, blocks: Block[], item: BlockItem) {
  if (item.action.kind !== 'transform') return
  const spec = specOfItem(item)
  // « Texte » : un élément devient un paragraphe qui garde ses enfants (un
  // élément de liste de texte, cf. `text-children`) ; rien sur un paragraphe
  // parent.
  const listName = spec?.list
    ? spec.name
    : spec?.name === PARAGRAPH
      ? TEXT_LIST
      : null
  if (listName) {
    const done = listUnits(editor.state, blocks, listName)
    if (done === 'same') return
    if (done) {
      const { tr, at } = done
      editor.view.dispatch(selectOn(tr, at[0], at[at.length - 1]))
      return
    }
  }
  const tr = editor.state.tr
  let units = blocks
  const unwrapped = unwrapItems(tr, blocks)
  if (unwrapped)
    units = blocks.map((_, i) => {
      const pos = unwrapped.at[i]
      return { pos, node: tr.doc.nodeAt(pos)!, list: null }
    })
  const since = tr.steps.length
  tr.setSelection(textRange(tr.doc, units))
  if (!item.action.apply(clearBlocks(chainOn(editor, tr))).run()) return
  editor.view.dispatch(reselect(tr, units, since))
}

/**
 * L'entrée de « Transformer en » d'un bloc, d'après le registre : celle de
 * son type ; pour un type à plusieurs entrées (les titres), celle de son
 * niveau — comme la barre de sélection.
 */
function itemOf(node: PMNode) {
  const items = (blockOfNode(node.type.name)?.items ?? []).filter(
    (i) => i.action.kind === 'transform',
  )
  if (items.length <= 1) return items[0] ?? null
  const level = node.attrs.level as number | undefined
  return items.find((i) => i.id.endsWith(`-${level}`)) ?? null
}

/**
 * Le nœud qui dit le type d'un bloc : sa liste, pour un élément ; son texte,
 * pour un paragraphe parent (sa liste de texte ne se voit pas).
 */
const typeNode = (b: Block) =>
  b.list?.type.name === TEXT_LIST
    ? (b.node.firstChild ?? b.node)
    : (b.list ?? b.node)

/** L'entrée des blocs, s'ils sont tous du même type. */
export function currentItem(blocks: Block[]) {
  const items = new Set(blocks.map((b) => itemOf(typeNode(b))))
  const [item] = items
  return items.size === 1 && item && TURN_INTO_ITEMS.includes(item)
    ? item
    : null
}

/** Le nom du type des blocs, pour l'en-tête du menu. */
export function blockLabel(blocks: Block[]) {
  const types = new Set(blocks.map((b) => typeNode(b).type.name))
  if (types.size > 1) return 'Plusieurs types'
  const node = blocks[0] && typeNode(blocks[0])
  if (!node) return ''
  if (node.type.name === QUESTION) return 'Question'
  return (
    currentItem(blocks)?.label ??
    blockOfNode(node.type.name)?.items?.[0]?.label ??
    'Bloc'
  )
}

/**
 * Colore le texte propre des blocs (`default` : retire la couleur) — celui
 * d'un élément, pas ses sous-éléments (chez Notion, chacun est un bloc).
 */
export function colorBlocks(
  editor: Editor,
  blocks: Block[],
  kind: ColorKind,
  color: NoteColor,
) {
  const { doc } = editor.state
  const ranges = blocks.map((b) => {
    const { from, to } = ownRange(b)
    return TextSelection.between(doc.resolve(from), doc.resolve(to))
  })
  applyColor(editor, kind, color, ranges)
  // La couleur ne déplace rien : les blocs se resélectionnent tels quels.
  selectBlocks(editor.view, blocks[0].pos, {
    head: blocks[blocks.length - 1].pos,
  })
}
