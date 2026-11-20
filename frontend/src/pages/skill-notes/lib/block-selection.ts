import { Extension } from '@tiptap/core'
import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import {
  bodyFlowOf,
  deepIn,
  flowOf,
  isItem,
  isList,
  markerOf,
  sameFlow,
  type Unit,
  unitAt,
  unitOfSelection,
} from './block-unit'
import {
  liftAcross,
  liftBlockOut,
  sinkAcross,
  sinkUnderItem,
  sinkUnderParagraph,
} from './list-indent'
import { TEXT_ITEM } from './text-children'
import { deleteUnits, duplicateUnits, moveUnits } from './unit-edit'

/**
 * La sélection de blocs (chantier « notes à la Notion », annexe §2, §4.5,
 * §5 « halo ») : un ou plusieurs blocs voisins d'une même suite (cf.
 * `block-unit` : des blocs d'un conteneur, et les éléments de ses listes,
 * chacun un bloc ; ou des sous-éléments d'un même élément), chacun sous un
 * halo. Elle naît d'un clic sur ⋮⋮, de ⌘/, d'Échap le curseur dans un bloc,
 * ou d'un rectangle tracé depuis le vide (`useMarquee`, qui la pose par
 * `selectBlocks`) ; ↑/↓ la déplacent (dans l'ordre de lecture, sous-éléments
 * compris), ⇧↑/⇧↓ l'étendent (dans sa suite), ⌘D duplique, ⌘⇧↑/↓ déplacent,
 * Suppr et Retour arrière suppriment, Entrée rend le curseur au bloc, Échap
 * la défait ; un clic ailleurs aussi. Un élément sélectionné emporte ses
 * sous-éléments.
 *
 * L'état — `anchor`, `head` : le début des blocs aux deux bouts, et `menu` :
 * le menu de bloc ouvert — vit dans ce plugin ; la sélection ProseMirror est
 * une `NodeSelection` sur le bloc `head` (le focus) ; copier et couper
 * prennent tous les blocs (`clip`). Toute autre sélection posée ailleurs (un
 * clic, une frappe) la défait.
 *
 * Jamais une question ne part au clavier (la garde de `question-node`) : la
 * suppression la saute, la duplication aussi (une question ne se double pas).
 */
export interface BlockSel {
  anchor: number
  head: number
  menu: boolean
}

const key = new PluginKey<BlockSel | null>('blockSelection')

/** L'état de la sélection de blocs, ou nul. */
export const blockSelOf = (state: EditorState) => key.getState(state) ?? null

/** Un bloc sélectionnable (cf. `block-unit`). */
export type Block = Unit

/** Le bloc du curseur (ou du nœud sélectionné). */
export const blockOfSelection = unitOfSelection

/** `anchor` et `head` désignent-ils des blocs d'une même suite ? */
const valid = (doc: EditorState['doc'], anchor: number, head: number) =>
  !!unitAt(doc, anchor) && !!unitAt(doc, head) && sameFlow(doc, anchor, head)

/** Les blocs sélectionnés, dans l'ordre du document. */
export function selectedBlocks(state: EditorState): Block[] {
  const sel = blockSelOf(state)
  if (!sel) return []
  const flow = flowOf(state.doc, sel.anchor)
  if (!flow) return []
  const a = flow.units.findIndex((u) => u.pos === sel.anchor)
  const h = flow.units.findIndex((u) => u.pos === sel.head)
  if (a < 0 || h < 0) return []
  return flow.units.slice(Math.min(a, h), Math.max(a, h) + 1)
}

/** Pose la sélection de blocs (ou la défait, `null`) sur une transaction. */
function withSel(tr: Transaction, sel: BlockSel | null): Transaction {
  tr.setMeta(key, sel)
  if (sel) {
    const node = tr.doc.nodeAt(sel.head)
    if (node && NodeSelection.isSelectable(node))
      tr.setSelection(NodeSelection.create(tr.doc, sel.head))
  }
  return tr
}

/**
 * Tab / ⇧Tab sur des éléments de liste sélectionnés : ils s'imbriquent sous
 * l'élément d'avant, ou remontent d'un niveau — comme au curseur, pour tous
 * à la fois. La sélection les suit. Rien sur le premier élément d'une liste
 * qui ne suit pas une autre liste (il n'a personne sous qui s'imbriquer).
 *
 * Des blocs qui ne sont pas des éléments (un paragraphe, un code…) passent
 * sous le dernier élément de la liste juste au-dessus d'eux, ou sous le
 * paragraphe juste au-dessus, ou en ressortent (relevés de Notion, 17/11 et
 * 18/11) ; de même pour les premiers éléments d'une liste sous un
 * paragraphe. Rien pour un mélange des deux (un paragraphe parent est un
 * élément : avec un paragraphe simple, c'est un mélange), ni sous un titre,
 * un séparateur, un code.
 */
function indentBlocks(view: EditorView, outdent: boolean) {
  const blocks = selectedBlocks(view.state)
  if (!blocks.length) return
  if (blocks.every((b) => !isItem(b.node))) {
    indentUnderItem(view, blocks, outdent)
    return
  }
  if (!blocks.every((b) => isItem(b.node))) return
  const type = blocks[0].node.type
  if (!blocks.every((b) => b.node.type === type)) return
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  // Un paragraphe parent au premier niveau ne remonte pas (les commandes de
  // liste le sortiraient de sa liste de texte).
  if (outdent && type.name === TEXT_ITEM) {
    const $first = view.state.doc.resolve(first.pos)
    if ($first.depth < 2 || !isItem($first.node($first.depth - 1))) return
  }
  // Sous le paragraphe juste au-dessus de leur liste.
  const under = outdent
    ? null
    : sinkUnderParagraph(view.state, first.pos, last.pos)
  if (under) {
    const { tr, shift } = under
    view.dispatch(
      selectOn(tr, shift(first.pos), shift(last.pos)).scrollIntoView(),
    )
    return
  }
  // Entre deux sortes de listes (une puce après ou sous un numéro) : sous le
  // dernier élément de la liste d'avant, ou un niveau plus haut en gardant
  // leur sorte.
  const across = (outdent ? liftAcross : sinkAcross)(
    view.state,
    first.pos + 2,
    last.pos + 2,
  )
  if (across) {
    const { tr, shift } = across
    view.dispatch(
      selectOn(tr, shift(first.pos), shift(last.pos)).scrollIntoView(),
    )
    return
  }
  // Le texte du premier au dernier : la plage d'éléments que les commandes de
  // liste déplacent ensemble.
  const doc = view.state.doc
  const ranged = view.state.apply(
    view.state.tr.setSelection(
      TextSelection.create(doc, first.pos + 2, last.pos + 2),
    ),
  )
  let out: Transaction | null = null
  const command = outdent ? liftListItem(type) : sinkListItem(type)
  command(ranged, (tr) => {
    out = tr
  })
  if (!out) return
  const tr: Transaction = out
  const at = (pos: number) => tr.mapping.map(pos + 1, 1) - 1
  view.dispatch(selectOn(tr, at(first.pos), at(last.pos)).scrollIntoView())
}

/** Tab / ⇧Tab sur des blocs hors liste : sous l'élément d'avant, ou dehors. */
function indentUnderItem(view: EditorView, blocks: Block[], outdent: boolean) {
  const first = blocks[0].pos
  const last = blocks[blocks.length - 1].pos
  // Plusieurs blocs remontent ensemble, frères : le premier n'adopte pas les
  // suivants.
  const done = outdent
    ? liftBlockOut(view.state, first, blocks.length === 1)
    : (sinkUnderItem(view.state, first, last) ??
      sinkUnderParagraph(view.state, first, last))
  if (!done) return
  const { tr, shift } = done
  view.dispatch(selectOn(tr, shift(first), shift(last)).scrollIntoView())
}

/** Sur `tr`, la sélection des blocs de `anchor` à `head` (menu fermé). */
export function selectOn(tr: Transaction, anchor: number, head = anchor) {
  return withSel(tr, { anchor, head, menu: false })
}

/** Sélectionne les blocs de `anchor` à `head` (par défaut un seul). */
export function selectBlocks(
  view: EditorView,
  anchor: number,
  opts: { head?: number; menu?: boolean } = {},
) {
  const sel = { anchor, head: opts.head ?? anchor, menu: !!opts.menu }
  view.dispatch(withSel(view.state.tr, sel).setMeta('addToHistory', false))
}

/** Ouvre ou ferme le menu de bloc, la sélection gardée. */
export function setBlockMenu(view: EditorView, menu: boolean) {
  const sel = blockSelOf(view.state)
  if (!sel || sel.menu === menu) return
  view.dispatch(
    view.state.tr.setMeta(key, { ...sel, menu }).setMeta('addToHistory', false),
  )
}

/** Défait la sélection de blocs. */
export function clearBlockSel(view: EditorView) {
  if (!blockSelOf(view.state)) return
  view.dispatch(view.state.tr.setMeta(key, null).setMeta('addToHistory', false))
}

/**
 * Après une transformation des `blocks` (type, couleur) portée par `tr` — les
 * pas à partir de `since` — : la sélection de blocs couvre ce qu'ils sont
 * devenus, menu fermé. Une liste née de la transformation : ses éléments.
 */
export function reselect(
  tr: Transaction,
  blocks: Block[],
  since = 0,
): Transaction {
  const mapping = tr.mapping.slice(since)
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  let anchor = mapping.map(first.pos, 1)
  while (tr.doc.nodeAt(anchor) && isList(tr.doc.nodeAt(anchor)!)) anchor += 1
  let end = mapping.map(last.pos + last.node.nodeSize, -1)
  let before = tr.doc.resolve(end).nodeBefore
  while (before && isList(before)) {
    end -= 1
    before = tr.doc.resolve(end).nodeBefore
  }
  const head = before ? end - before.nodeSize : anchor
  if (valid(tr.doc, anchor, head)) return selectOn(tr, anchor, head)
  return tr
    .setMeta(key, null)
    .setSelection(Selection.near(tr.doc.resolve(Math.max(anchor, 0))))
}

/** ⌘D : les blocs dupliqués juste dessous ; la sélection passe aux copies. */
export function duplicateBlocks(view: EditorView) {
  const done = duplicateUnits(view.state, selectedBlocks(view.state))
  if (!done) return
  view.dispatch(selectOn(done.tr, done.at[0], done.at[done.at.length - 1]))
}

/**
 * Suppr / Retour arrière : les blocs sélectionnés partent, sauf les
 * questions (elles restent, sélectionnées) ; une liste vidée disparaît. Le
 * curseur va au bloc d'avant.
 */
export function deleteBlocks(view: EditorView) {
  const done = deleteUnits(view.state, selectedBlocks(view.state))
  if (!done) return
  const { tr, at } = done
  if (at.length) {
    view.dispatch(selectOn(tr, at[0], at[at.length - 1]))
    return
  }
  const caret = Math.min(done.caret, tr.doc.content.size)
  tr.setSelection(Selection.near(tr.doc.resolve(caret), -1)).setMeta(key, null)
  view.dispatch(tr.scrollIntoView())
}

/** ⌘⇧↑ / ⌘⇧↓ : les blocs passent par-dessus leur voisin. */
export function moveBlocks(view: EditorView, dir: -1 | 1) {
  const sel = blockSelOf(view.state)
  const blocks = selectedBlocks(view.state)
  if (!sel) return
  const done = moveUnits(view.state, blocks, dir)
  if (!done) return
  const { at } = done
  const up = sel.anchor > sel.head
  view.dispatch(
    withSel(done.tr, {
      anchor: up ? at[at.length - 1] : at[0],
      head: up ? at[0] : at[at.length - 1],
      menu: false,
    }).scrollIntoView(),
  )
}

/**
 * ↑/↓ : la sélection passe au bloc d'avant ou d'après, dans l'ordre de
 * lecture (d'un élément à ses sous-éléments) ; ⇧ : l'étend, dans sa suite.
 */
function step(view: EditorView, dir: -1 | 1, extend: boolean) {
  const sel = blockSelOf(view.state)
  if (!sel) return
  const { doc } = view.state
  let next: Block | undefined
  if (extend) {
    const units = flowOf(doc, sel.head)?.units ?? []
    next = units[units.findIndex((u) => u.pos === sel.head) + dir]
  } else {
    const body = bodyFlowOf(doc, sel.head)
    const units = body ? deepIn(body.host, body.start) : []
    const i = units.findIndex((u) => u.pos === sel.head)
    next = i < 0 ? undefined : units[i + dir]
  }
  if (!next) return
  view.dispatch(
    withSel(view.state.tr, {
      anchor: extend ? sel.anchor : next.pos,
      head: next.pos,
      menu: false,
    }).scrollIntoView(),
  )
}

/** Entrée : le curseur revient en fin du bloc `head`. */
function enter(view: EditorView) {
  const sel = blockSelOf(view.state)
  if (!sel) return
  const node = view.state.doc.nodeAt(sel.head)
  if (!node) return
  const end = sel.head + node.nodeSize
  const tr = view.state.tr.setMeta(key, null)
  if (node.isAtom) tr.setSelection(NodeSelection.create(tr.doc, sel.head))
  else tr.setSelection(Selection.near(tr.doc.resolve(end - 1), -1))
  view.dispatch(tr)
}

/**
 * Le halo (§5) : l'accent des notes (encre du domaine) à 14 %, rayon 4, en
 * fondu 0,2 s. Chez Notion, le texte
 * est à 8 px du bord du bloc et le halo inséré de 2 px : 6 px d'air à gauche et
 * à droite du texte. Nos blocs n'ont pas ce padding latéral (le texte est au
 * bord du bloc) : le halo déborde donc de 6 px de chaque côté, et reste inséré
 * de 2 px en haut et en bas. Un élément de liste l'étend à gauche sur son
 * marqueur (`--halo-left`), et le porte sur ses sous-éléments.
 */
const HALO = [
  'relative',
  'after:pointer-events-none after:absolute after:inset-y-0.5 after:right-[-6px] after:left-(--halo-left) after:z-10 after:rounded after:bg-(--note-accent)/14 after:content-[""]',
  'after:animate-in after:fade-in-0 after:duration-200',
  // La sélection du navigateur (la NodeSelection) ne se voit pas sous le halo.
  'selection:bg-transparent',
].join(' ')

/** Met les blocs sélectionnés au presse-papiers (et les retire : couper). */
function clip(view: EditorView, event: ClipboardEvent, cut: boolean) {
  const blocks = selectedBlocks(view.state)
  const data = event.clipboardData
  if (!blocks.length || !data) return false
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  const slice = view.state.doc.slice(first.pos, last.pos + last.node.nodeSize)
  const { dom, text } = view.serializeForClipboard(slice)
  event.preventDefault()
  data.clearData()
  data.setData('text/html', dom.innerHTML)
  data.setData('text/plain', text)
  if (cut) deleteBlocks(view)
  return true
}

export const blockSelection = Extension.create({
  name: 'blockSelection',
  // Avant les raccourcis des blocs : la sélection de blocs prend la main.
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin<BlockSel | null>({
        key,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const meta = tr.getMeta(key) as BlockSel | null | undefined
            if (meta !== undefined) return meta
            if (!value) return null
            // Une autre sélection (clic, frappe) : on la défait.
            if (tr.selectionSet) return null
            if (!tr.docChanged) return value
            const anchor = tr.mapping.mapResult(value.anchor, 1)
            const head = tr.mapping.mapResult(value.head, 1)
            if (anchor.deleted || head.deleted) return null
            const ok = valid(tr.doc, anchor.pos, head.pos)
            return ok ? { ...value, anchor: anchor.pos, head: head.pos } : null
          },
        },
        props: {
          decorations: (state) => {
            const blocks = selectedBlocks(state)
            if (!blocks.length) return null
            return DecorationSet.create(
              state.doc,
              blocks.map((b) =>
                Decoration.node(b.pos, b.pos + b.node.nodeSize, {
                  class: HALO,
                  style: `--halo-left: -${6 + markerOf(b.list)}px`,
                }),
              ),
            )
          },
          handleKeyDown: (view, event) => {
            const mod = event.metaKey || event.ctrlKey
            // ⌘/ : le menu du bloc, depuis le curseur comme depuis le halo.
            if (mod && event.key === '/') {
              const sel = blockSelOf(view.state)
              if (sel) setBlockMenu(view, true)
              else {
                const block = blockOfSelection(view.state)
                if (!block) return false
                selectBlocks(view, block.pos, { menu: true })
              }
              return true
            }
            const sel = blockSelOf(view.state)
            if (!sel) {
              // Échap, le curseur dans un bloc : le bloc est sélectionné.
              if (event.key !== 'Escape' || mod || event.shiftKey) return false
              const block = blockOfSelection(view.state)
              if (!block) return false
              selectBlocks(view, block.pos)
              return true
            }
            if (sel.menu) return false
            const up = event.key === 'ArrowUp'
            const down = event.key === 'ArrowDown'
            if ((up || down) && mod && event.shiftKey)
              moveBlocks(view, up ? -1 : 1)
            else if ((up || down) && !mod)
              step(view, up ? -1 : 1, event.shiftKey)
            else if (mod && event.key.toLowerCase() === 'd')
              duplicateBlocks(view)
            else if (event.key === 'Backspace' || event.key === 'Delete')
              deleteBlocks(view)
            else if (event.key === 'Tab') indentBlocks(view, event.shiftKey)
            else if (event.key === 'Enter') enter(view)
            else if (event.key === 'Escape') clearBlockSel(view)
            // Copier, couper (cf. `clip`), tout sélectionner : au navigateur.
            else if (mod) return false
            // Une frappe ne remplace pas les blocs (Tab, lettres, touches mortes…).
            else if (
              event.key.length === 1 ||
              event.key === 'Tab' ||
              event.key === 'Dead'
            )
              return true
            else return false
            return true
          },
          // Copier, couper : tous les blocs sélectionnés. Le navigateur ne
          // copierait que la sélection ProseMirror, le seul bloc `head` —
          // après ⌘A, la ligne vide de fin.
          handleDOMEvents: {
            copy: (view, event) => clip(view, event, false),
            cut: (view, event) => clip(view, event, true),
          },
          // Ce qui arrive sans frappe ordinaire (« à », un accent composé, la
          // dictée…) ne remplace pas non plus les blocs sélectionnés.
          handleTextInput: (view) => {
            const sel = blockSelOf(view.state)
            return !!sel && !sel.menu
          },
        },
      }),
    ]
  },
})
