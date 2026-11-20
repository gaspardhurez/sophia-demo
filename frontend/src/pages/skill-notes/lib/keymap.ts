import { type Editor, Extension, InputRule, markInputRule } from '@tiptap/core'
import { type ResolvedPos, Slice } from '@tiptap/pm/model'
import {
  type EditorState,
  NodeSelection,
  Selection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'
import { splitBlock } from '@tiptap/pm/commands'
import { liftTarget } from '@tiptap/pm/transform'

import { blockSelOf, selectBlocks } from './block-selection'
import { flowIn, isItem, type Unit, unitAround, unitAt } from './block-unit'
import { BODY_CONTAINERS, HEADING, PARAGRAPH } from './blocks'
import { COLUMN, COLUMNS } from './columns'
import {
  dissolveParent,
  liftAcross,
  liftOutOfItem,
  sinkAcross,
  sinkUnderItem,
  sinkUnderParagraph,
} from './list-indent'
import { TEXT_ITEM, TEXT_LIST } from './text-children'
import { dropColumn, moveUnits } from './unit-edit'

/**
 * La saisie à la Notion (relevé §4.1–4.4) : ce que font Entrée, Retour
 * arrière, Tab, ⌘⇧↑/↓, ⌘A et ⌘Z dans les notes, et les raccourcis Markdown
 * qui ne sont ni à StarterKit ni à un bloc (`---`, `~barré~`).
 *
 * Les règles d'entrée propres à un bloc vivent dans son fichier
 * (`blocks/ordered-list` pour `a. `, `blocks/blockquote` pour `" ` et `| `,
 * `blocks/code-block` pour ` ``` `) ; le reste vient de StarterKit (`# `,
 * `- `, `1. `, `**gras**`, `*it*`, `` `code` ``, ⌘B/I/U/E, ⇧⌘S).
 *
 * Ces touches passent **avant** celles des blocs (priorité 110) : elles ne
 * jouent donc que là où l'on connaît tout — texte, titres, listes, citation,
 * code, colonnes. Dès qu'un ancêtre est un autre bloc (toggle, encadré,
 * tâche…), elles laissent la main à ce bloc.
 *
 * La garde des questions (`question-node`) tient toujours : aucune de ces
 * commandes ne retire une question ; un Retour arrière juste après une
 * question la **sélectionne** au lieu de la fondre.
 */

const LIST_ITEM = 'listItem'
const BLOCKQUOTE = 'blockquote'
const CODE_BLOCK = 'codeBlock'
const HORIZONTAL_RULE = 'horizontalRule'

/** Les conteneurs dont les enfants sont des blocs de la page. */
const PAGE = new Set(['doc', COLUMN])

/** Les nœuds dont on connaît le clavier : le reste appartient à son bloc. */
const KNOWN = new Set([
  ...PAGE,
  COLUMNS,
  PARAGRAPH,
  HEADING,
  BLOCKQUOTE,
  CODE_BLOCK,
  'bulletList',
  'orderedList',
  LIST_ITEM,
  TEXT_LIST,
  TEXT_ITEM,
])

const known = ($pos: ResolvedPos) => {
  for (let d = 0; d <= $pos.depth; d++)
    if (!KNOWN.has($pos.node(d).type.name)) return false
  return true
}

type Dispatch = ((tr: Transaction) => void) | undefined

/** Le curseur seul, en tête d'un bloc de texte qu'on connaît. */
function caretAtStart(state: EditorState) {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const { $from } = selection
  if (!$from.parent.isTextblock || $from.parentOffset !== 0) return null
  return known($from) ? $from : null
}

/** Remonte le bloc d'un niveau (hors de sa liste, de sa citation). */
function lift(state: EditorState, dispatch: Dispatch) {
  const range = state.selection.$from.blockRange()
  const target = range && liftTarget(range)
  if (target == null || !range) return false
  dispatch?.(state.tr.lift(range, target).scrollIntoView())
  return true
}

/**
 * Bloc vide : supprimé, curseur en fin du précédent (ou la question d'avant
 * sélectionnée). Rien si rien ne le précède dans son conteneur.
 */
function removeEmpty(state: EditorState, dispatch: Dispatch) {
  const $from = state.selection.$from
  const d = $from.depth
  const index = $from.index(d - 1)
  if (index === 0) return false
  // Un bloc d'avant qu'on ne connaît pas (toggle replié…) décide lui-même où
  // va le curseur.
  const before = $from.node(d - 1).child(index - 1)
  if (!before.isAtom && !KNOWN.has(before.type.name)) return false
  const tr = state.tr.delete($from.before(d), $from.after(d))
  tr.setSelection(Selection.near(tr.doc.resolve($from.before(d)), -1))
  dispatch?.(tr.scrollIntoView())
  return true
}

/**
 * Fusion avec le bloc d'avant (Notion) : le texte rejoint la fin du dernier
 * bloc de texte qui précède — dans une liste, une citation ou une colonne
 * s'il le faut. Une question (ou tout bloc sans texte) juste avant est
 * sélectionnée, jamais fondue.
 */
function mergeBackward(state: EditorState, dispatch: Dispatch) {
  const $from = state.selection.$from
  const d = $from.depth
  const index = $from.index(d - 1)
  if (index === 0) return false
  let node = $from.node(d - 1).child(index - 1)
  // `end` : juste après `node`.
  let end = $from.before(d)
  while (!node.isTextblock) {
    if (node.isAtom) {
      if (!NodeSelection.isSelectable(node)) return false
      const at = NodeSelection.create(state.doc, end - node.nodeSize)
      dispatch?.(state.tr.setSelection(at).scrollIntoView())
      return true
    }
    if (!KNOWN.has(node.type.name) || !node.lastChild) return false
    end -= 1
    node = node.lastChild
  }
  if (node.type.name === CODE_BLOCK) return false
  const block = $from.parent
  const into = end - 1
  const tr = state.tr.replace(
    into,
    $from.after(d),
    new Slice(block.content, 0, 0),
  )
  // Sécurité : tout le texte est encore là.
  if (tr.doc.textContent.length !== state.doc.textContent.length) return false
  tr.setSelection(TextSelection.create(tr.doc, into))
  dispatch?.(tr.scrollIntoView())
  return true
}

/**
 * Retour arrière en tête de bloc (relevé §4.4, à la Sophia pour les titres).
 * - titre non vide → texte ; titre vide → supprimé ;
 * - puce, numéro → texte au même niveau ; imbriquée : texte imbriqué, puis
 *   désindenté, puis fusion ;
 * - citation → texte ;
 * - enfant d'un paragraphe : désindenté ; le texte d'un paragraphe parent
 *   imbriqué aussi ; au premier niveau, il fusionne avec le bloc d'avant et
 *   ses enfants remontent d'un niveau (relevé Notion, 18/11) ;
 * - bloc vide → supprimé, curseur en fin du précédent ; sinon fusion.
 */
function backspace(editor: Editor) {
  const { state } = editor
  const $from = caretAtStart(state)
  if (!$from) return false
  const block = $from.parent
  const d = $from.depth
  const parent = $from.node(d - 1).type.name
  const dispatch = editor.view.dispatch.bind(editor.view)
  const type = block.type.name

  if (type === HEADING)
    return block.content.size
      ? editor.commands.setNode(PARAGRAPH)
      : removeEmpty(state, dispatch)
  if (type !== PARAGRAPH) return false

  if (parent === LIST_ITEM) {
    if ($from.index(d - 1) === 0) {
      // Une puce imbriquée devient du texte dans l'élément parent ; au
      // premier niveau (ou si le texte ne peut pas y rester), elle sort.
      const nested = d >= 4 && $from.node(d - 3).type.name === LIST_ITEM
      if (nested && lift(state, dispatch)) return true
      return editor.commands.liftListItem(LIST_ITEM)
    }
    // Du texte imbriqué : il se désindente (comme ⇧Tab), puis fusionne.
    return (
      liftOutOfItem(state, dispatch) ||
      lift(state, dispatch) ||
      mergeBackward(state, dispatch)
    )
  }
  if (parent === TEXT_ITEM) {
    if ($from.index(d - 1) === 0)
      return isItem($from.node(d - 3))
        ? outdentParent(editor)
        : mergeParent(state, $from.before(d - 1), dispatch)
    return (
      liftOutOfItem(state, dispatch) ||
      lift(state, dispatch) ||
      mergeBackward(state, dispatch)
    )
  }
  if (parent === BLOCKQUOTE) return lift(state, dispatch)
  // En tête d'une colonne, un bloc vide n'a rien avant lui à rejoindre : seul,
  // il emporte la colonne (une seule restante rend ses blocs à la page) ;
  // suivi d'autres, il part et le curseur passe au suivant.
  if (parent === COLUMN && !block.content.size && $from.index(d - 1) === 0) {
    const column = $from.node(d - 1)
    if (column.childCount === 1) {
      const done = dropColumn(state, {
        host: column,
        start: $from.start(d - 1),
      })
      const caret = Math.min(done.caret, done.tr.doc.content.size)
      done.tr.setSelection(Selection.near(done.tr.doc.resolve(caret), 1))
      dispatch(done.tr.scrollIntoView())
      return true
    }
    const tr = state.tr.delete($from.before(d), $from.after(d))
    tr.setSelection(Selection.near(tr.doc.resolve($from.before(d)), 1))
    dispatch(tr.scrollIntoView())
    return true
  }
  if (!block.content.size) return removeEmpty(state, dispatch)
  return mergeBackward(state, dispatch)
}

/**
 * Retour arrière en tête d'un paragraphe parent, au premier niveau (relevé
 * Notion, 18/11) : ses enfants remontent d'un niveau (`dissolveParent`),
 * puis son texte rejoint le bloc d'avant (`mergeBackward`) — une seule
 * transaction. Une question juste avant est sélectionnée, rien ne bouge ;
 * rien avant lui : rien.
 */
function mergeParent(
  state: EditorState,
  itemStart: number,
  dispatch: Dispatch,
) {
  const done = dissolveParent(state, itemStart)
  if (!done) return true
  const freed = state.apply(done.tr)
  const caret = freed.apply(
    freed.tr.setSelection(TextSelection.create(freed.doc, done.at + 1)),
  )
  let merged: Transaction | null = null
  if (!mergeBackward(caret, (tr) => (merged = tr)) || !merged) return true
  const m: Transaction = merged
  if (!m.docChanged) {
    // Une question avant lui : sélectionnée (elle précède la liste, sa
    // position ne dépend pas de `dissolveParent`).
    if (m.selection instanceof NodeSelection)
      dispatch?.(
        state.tr
          .setSelection(NodeSelection.create(state.doc, m.selection.from))
          .scrollIntoView(),
      )
    return true
  }
  const { tr } = done
  for (const step of m.steps) tr.step(step)
  tr.setSelection(TextSelection.create(tr.doc, m.selection.anchor))
  dispatch?.(tr.scrollIntoView())
  return true
}

/**
 * Le texte d'un paragraphe parent remonte d'un niveau (⇧Tab, Retour arrière
 * en tête) : hors d'une liste d'une autre sorte (`liftAcross`), ou d'un
 * paragraphe parent (les commandes de liste). Au premier niveau, rien.
 */
function outdentParent(editor: Editor) {
  return tabAcross(editor, liftAcross) || liftTextItem(editor)
}

/** ⇧Tab dans le texte d'un paragraphe parent rangé sous un autre. */
function liftTextItem(editor: Editor) {
  const { $from } = editor.state.selection
  const d = $from.depth
  if (d < 5 || $from.node(d - 1).type.name !== TEXT_ITEM) return false
  if ($from.index(d - 1) !== 0) return false
  if ($from.node(d - 3).type.name !== TEXT_ITEM) return false
  return editor.commands.liftListItem(TEXT_ITEM)
}

/** Tab dans le texte d'un paragraphe parent : sous l'élément d'avant. */
function sinkTextItem(editor: Editor) {
  const { $from } = editor.state.selection
  const d = $from.depth
  if (d < 2 || $from.node(d - 1).type.name !== TEXT_ITEM) return false
  if ($from.index(d - 1) !== 0) return false
  return editor.commands.sinkListItem(TEXT_ITEM)
}

/**
 * Entrée en tête d'un paragraphe parent non vide (Notion) : un bloc vide
 * au-dessus de lui, à son niveau — pas son texte coupé, qui deviendrait son
 * premier enfant. L'élément vide posé redevient un paragraphe
 * (`text-children`).
 */
function enterAtParentStart(editor: Editor) {
  const { state } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const { $from } = selection
  const d = $from.depth
  if (d < 2 || $from.parentOffset !== 0 || !$from.parent.content.size)
    return false
  if ($from.node(d - 1).type.name !== TEXT_ITEM || $from.index(d - 1) !== 0)
    return false
  const { nodes } = state.schema
  const empty = nodes[TEXT_ITEM].create(null, nodes[PARAGRAPH].create())
  const tr = state.tr.insert($from.before(d - 1), empty)
  tr.setSelection(TextSelection.create(tr.doc, $from.pos + empty.nodeSize))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Entrée dans le dernier bloc d'une citation : la suite part dans un bloc de
 * texte **sous** la citation (Notion). Un dernier bloc vide (après d'autres)
 * en sort lui-même.
 */
function enterInQuote(editor: Editor) {
  const { state } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const { $from } = selection
  const d = $from.depth
  if (!$from.parent.isTextblock || d < 2 || !known($from)) return false
  const quote = $from.node(d - 1)
  if (quote.type.name !== BLOCKQUOTE) return false
  const index = $from.index(d - 1)
  if (index !== quote.childCount - 1) return false
  const block = $from.parent
  const dispatch = editor.view.dispatch.bind(editor.view)
  if (!block.content.size)
    return index > 0 ? lift(state, dispatch) : below(state, dispatch)
  // En tête d'un bloc non vide : un bloc vide au-dessus, comme ailleurs.
  if ($from.parentOffset === 0) return false
  return below(state, dispatch)
}

/**
 * Entrée dans un bloc **enfant** d'un élément de liste ou d'un paragraphe —
 * pas son texte, un bloc rangé sous lui (relevé de Notion, 13/10 et 18/11) :
 * un nouveau bloc de texte
 * sous l'élément, à la même indentation, même sur un bloc vide. Les commandes
 * de liste, elles, coupaient l'élément : la suite devenait un élément de la
 * liste parente.
 */
function enterInItemChild(editor: Editor) {
  const { state } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection)) return false
  const { $from, $to } = selection
  const d = $from.depth
  if (!$from.parent.isTextblock || !$from.sameParent($to) || d < 2) return false
  if ($from.parent.type.name === CODE_BLOCK || !known($from)) return false
  const host = $from.node(d - 1).type.name
  if ((host !== LIST_ITEM && host !== TEXT_ITEM) || $from.index(d - 1) === 0)
    return false
  return splitBlock(state, editor.view.dispatch.bind(editor.view))
}

/** Coupe au curseur et pose la suite dans un paragraphe sous la citation. */
function below(state: EditorState, dispatch: Dispatch) {
  const { $from } = state.selection
  const d = $from.depth
  const rest = $from.parent.content.cut($from.parentOffset)
  const tr = state.tr.delete($from.pos, $from.end())
  const at = tr.mapping.map($from.after(d - 1))
  tr.insert(at, state.schema.nodes[PARAGRAPH].create(null, rest))
  tr.setSelection(TextSelection.create(tr.doc, at + 1))
  dispatch?.(tr.scrollIntoView())
  return true
}

/** Les nœuds où ⌘⇧↑/↓ déplace le bloc du curseur (les tâches en plus). */
const MOVABLE = new Set([...KNOWN, 'taskList', 'taskItem'])

/**
 * ⌘⇧↑ / ⌘⇧↓ : le bloc du curseur (cf. `block-unit` : un élément de liste en
 * est un) monte ou descend d'un cran dans sa suite — par-dessus son voisin,
 * et, au bord d'une liste, hors d'elle (il garde son type, comme chez
 * Notion) —, comme le fait la sélection de blocs (`moveUnits`).
 */
function moveCurrent(editor: Editor, dir: -1 | 1) {
  const { state } = editor
  const { selection } = state
  const { $from } = selection
  let unit: Unit | null
  // Une question (ou un bloc sans texte) sélectionnée : elle-même.
  if (selection instanceof NodeSelection) unit = unitAt(state.doc, $from.pos)
  else {
    if (!$from.sameParent(selection.$to) || !$from.parent.isTextblock)
      return false
    for (let d = 0; d <= $from.depth; d++)
      if (!MOVABLE.has($from.node(d).type.name)) return false
    unit = unitAround($from)
  }
  if (!unit) return false
  const done = moveUnits(state, [unit], dir)
  // Au bout de sa suite, le bloc reste où il est.
  if (!done) return true
  const shift = done.at[0] - unit.pos
  const { tr } = done
  tr.setSelection(
    selection instanceof NodeSelection
      ? NodeSelection.create(tr.doc, selection.from + shift)
      : TextSelection.create(
          tr.doc,
          selection.anchor + shift,
          selection.head + shift,
        ),
  )
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * ⌘A (Notion) : une fois le texte du bloc ; deux fois — ou le texte déjà tout
 * pris, un bloc vide, une sélection de blocs — tous les blocs du premier
 * niveau, en sélection de blocs. Jamais la sélection « tout le document » de
 * ProseMirror : Suppr la laissait, mappée, sur le paragraphe vide restant (un
 * résidu teinté).
 */
function selectAll(editor: Editor) {
  const { state, view } = editor
  const { selection } = state
  const { $from, $to } = selection
  if (
    !blockSelOf(state) &&
    selection instanceof TextSelection &&
    $from.sameParent($to) &&
    $from.parent.isTextblock &&
    $from.parent.content.size
  ) {
    const start = $from.start()
    const end = $from.end()
    if (selection.from !== start || selection.to !== end) {
      view.dispatch(
        state.tr.setSelection(TextSelection.create(state.doc, start, end)),
      )
      return true
    }
  }
  const blocks = flowIn(state.doc, 0)
  if (!blocks.length) return false
  selectBlocks(view, blocks[0].pos, { head: blocks[blocks.length - 1].pos })
  return true
}

const inCode = (editor: Editor) =>
  editor.state.selection.$from.parent.type.name === CODE_BLOCK

/**
 * `---` : un séparateur tout de suite, et un bloc de texte dessous où l'on
 * continue (relevé §4.1) — la seule règle du séparateur (`***`, `___` restent
 * du texte). Seulement dans un paragraphe d'un conteneur de blocs (la page,
 * une colonne, un menu dépliant, un encadré) ou rangé sous un élément ou un
 * paragraphe ; sans le nœud
 * `horizontalRule`, rien.
 */
const separatorRule = new InputRule({
  find: /^---$/,
  handler: ({ state, range }) => {
    const rule = state.schema.nodes[HORIZONTAL_RULE]
    const $from = state.doc.resolve(range.from)
    // Aussi dans un enfant d'un élément ou d'un paragraphe (pas son texte).
    const host = $from.node(-1)
    const child = isItem(host) && $from.index(-1) > 0
    if (
      !rule ||
      $from.parent.type.name !== PARAGRAPH ||
      !(BODY_CONTAINERS.has(host.type.name) || child)
    )
      return null
    const rest = $from.parent.content.cut(range.to - $from.start())
    const start = $from.before()
    const { tr } = state
    tr.replaceWith(start, $from.after(), [
      rule.create(),
      state.schema.nodes[PARAGRAPH].create(null, rest),
    ])
    tr.setSelection(TextSelection.create(tr.doc, start + 2))
  },
})

export const inputBehaviors = Extension.create({
  name: 'notesInput',
  // Avant les touches des blocs (100) et les règles de StarterKit.
  priority: 110,

  addInputRules() {
    const strike = this.editor.schema.marks.strike
    return [
      separatorRule,
      // `~barré~`, d'un seul tilde comme Notion (StarterKit a `~~…~~`).
      ...(strike
        ? [
            markInputRule({
              find: /(?:^|\s)(~(?!\s+~)([^~]+)~(?!\s+~))$/,
              type: strike,
            }),
          ]
        : []),
    ]
  },

  addKeyboardShortcuts() {
    return {
      // ⌘Z juste après une conversion Markdown : le texte littéral revient.
      'Mod-z': () => this.editor.commands.undoInputRule(),
      Backspace: () =>
        this.editor.commands.undoInputRule() || backspace(this.editor),
      Enter: () =>
        enterInItemChild(this.editor) ||
        enterAtParentStart(this.editor) ||
        enterInQuote(this.editor),
      // ⇧Entrée : saut de ligne, aussi dans le code (StarterKit en sortirait).
      'Shift-Enter': () =>
        inCode(this.editor) &&
        this.editor.commands.command(({ tr }) => {
          tr.insertText('\n').scrollIntoView()
          return true
        }),
      // ⌘Entrée sort du code vers un bloc de texte dessous.
      'Mod-Enter': () => inCode(this.editor) && this.editor.commands.exitCode(),
      'Mod-Shift-ArrowUp': () => moveCurrent(this.editor, -1),
      'Mod-Shift-ArrowDown': () => moveCurrent(this.editor, 1),
      'Mod-a': () => selectAll(this.editor),
      // Entre deux sortes de listes ; un bloc juste après une liste passe
      // sous son dernier élément, juste après un paragraphe sous lui
      // (Notion) ; un paragraphe parent sous le paragraphe parent d'avant.
      Tab: () =>
        tabAcross(this.editor, sinkAcross) ||
        tabUnderItem(this.editor) ||
        tabUnderParagraph(this.editor) ||
        sinkTextItem(this.editor),
      // Un bloc rangé sous un élément sort après lui (Notion), et adopte ceux
      // qui le suivaient s'il est un paragraphe ; le texte d'un élément passe
      // aux commandes de liste.
      'Shift-Tab': () =>
        liftOutOfItem(this.editor.state, this.editor.view.dispatch) ||
        tabAcross(this.editor, liftAcross) ||
        liftTextItem(this.editor),
    }
  },
})

/**
 * Tab, ⇧Tab entre deux sortes de listes (une puce après ou sous un numéro…) :
 * `sinkAcross`, `liftAcross`. Ailleurs, la main passe aux commandes de
 * liste.
 */
function tabAcross(editor: Editor, move: typeof sinkAcross) {
  const { state } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection)) return false
  const done = move(state, selection.from, selection.to)
  if (!done) return false
  const { tr, shift } = done
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      shift(selection.anchor),
      shift(selection.head),
    ),
  )
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Tab au curseur dans un bloc de texte (pas le texte d'un élément) qui suit
 * une liste : il passe sous son dernier élément (`sinkUnderItem`), le curseur
 * avec lui. Pas dans le code : Tab y indente.
 */
function tabUnderItem(editor: Editor) {
  const { state } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection)) return false
  const { $from, $to } = selection
  const block = $from.parent
  if (!$from.sameParent($to) || !block.isTextblock || block.type.spec.code)
    return false
  const unit = unitAround($from)
  if (!unit || unit.list || unit.node !== block) return false
  const done = sinkUnderItem(state, unit.pos)
  if (!done) return false
  const { tr, shift } = done
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      shift(selection.anchor),
      shift(selection.head),
    ),
  )
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Tab au curseur dans un bloc — ou le texte du premier élément d'une liste —
 * juste après un paragraphe : il devient son enfant (`sinkUnderParagraph`),
 * le curseur avec lui. Pas dans le code : Tab y indente.
 */
function tabUnderParagraph(editor: Editor) {
  const { state } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection)) return false
  const { $from, $to } = selection
  const block = $from.parent
  if (!$from.sameParent($to) || !block.isTextblock || block.type.spec.code)
    return false
  const unit = unitAround($from)
  if (!unit) return false
  // Le curseur dans le texte de l'élément, ou dans le bloc lui-même.
  const own = unit.list ? unit.node.firstChild === block : unit.node === block
  if (!own) return false
  const done = sinkUnderParagraph(state, unit.pos)
  if (!done) return false
  const { tr, shift } = done
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      shift(selection.anchor),
      shift(selection.head),
    ),
  )
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Tab / ⇧Tab là où rien ne s'indente (sous un titre, un séparateur, au
 * premier niveau…) : rien, mais le focus ne quitte pas la page. Après tous les
 * blocs : une liste imbrique, le code indente, un bloc qui gère Tab le garde.
 */
export const tabFallback = Extension.create({
  name: 'notesTab',
  priority: 10,

  addKeyboardShortcuts() {
    return { Tab: () => true, 'Shift-Tab': () => true }
  },
})

/** Les comportements clavier des notes (cf. `editorExtensions`). */
export const notesKeymap = [inputBehaviors, tabFallback]
