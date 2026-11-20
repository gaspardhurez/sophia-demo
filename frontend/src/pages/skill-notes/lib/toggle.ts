import { Extension, InputRule, Node } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'

import { backspaceOutOf, enterInContainer } from './container-keys'
import { type Fold, foldGuard } from './fold'
import { foldButton } from './fold-button'

/**
 * Le menu dépliant (relevé Notion §1.4, §4.3) : un titre qu'on écrit, et sous
 * lui des blocs enfants — questions comprises — en retrait de 32 px, que le
 * triangle replie. Ouvert ou fermé, c'est écrit dans le document (`open`).
 *
 * `toggle` = `toggleTitle` (le titre, du texte) + `toggleContent` (les
 * enfants, un conteneur de blocs de la page).
 */
export const TOGGLE = 'toggle'
export const TOGGLE_TITLE = 'toggleTitle'
export const TOGGLE_CONTENT = 'toggleContent'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      /** Le bloc texte du curseur devient le titre d'un menu dépliant ouvert. */
      setToggle: () => ReturnType
    }
  }
}

/** Le bloc texte en `pos` → un menu dépliant ouvert, curseur en fin de titre. */
function toToggle(tr: Transaction, pos: number): boolean {
  const block = tr.doc.nodeAt(pos)
  if (!block?.isTextblock || block.type.name === TOGGLE_TITLE) return false
  const { nodes } = tr.doc.type.schema
  const $pos = tr.doc.resolve(pos)
  if (
    !$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, nodes[TOGGLE])
  )
    return false
  const toggle = nodes[TOGGLE].create({ open: true }, [
    nodes[TOGGLE_TITLE].create(null, block.content),
    nodes[TOGGLE_CONTENT].create(null, nodes.paragraph.create()),
  ])
  tr.replaceWith(pos, pos + block.nodeSize, toggle)
  tr.setSelection(TextSelection.create(tr.doc, pos + 2 + block.content.size))
  return true
}

/** Les contenus des menus fermés. */
function closedToggles(doc: PMNode): Fold[] {
  const folds: Fold[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) return false
    if (node.type.name !== TOGGLE || node.attrs.open) return true
    const title = node.child(0)
    const from = pos + 1 + title.nodeSize
    folds.push({ from, to: from + node.child(1).nodeSize, before: from - 1 })
    return false
  })
  return folds
}

export const Toggle = Node.create({
  name: TOGGLE,
  group: 'block',
  content: `${TOGGLE_TITLE} ${TOGGLE_CONTENT}`,
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        // Un `<details>` collé (Notion, le web) arrive fermé, sauf `open`.
        parseHTML: (el) =>
          el.tagName === 'DETAILS'
            ? el.hasAttribute('open')
            : el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': String(attrs.open) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-toggle]' }, { tag: 'details' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-toggle': '', ...HTMLAttributes }, 0]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('div')
      dom.setAttribute('data-toggle', '')
      // Fermé : les enfants ne s'affichent pas (ils restent dans le document).
      dom.className =
        'relative [&[data-open=false]>div>[data-toggle-content]]:hidden'
      const { button, render } = foldButton(() => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        // Ouvrir ou fermer ne s'annule pas : ce n'est pas une écriture.
        editor.view.dispatch(
          editor.state.tr
            .setNodeAttribute(pos, 'open', !current.attrs.open)
            .setMeta('addToHistory', false),
        )
      })
      const body = document.createElement('div')
      dom.append(button, body)
      const paint = (n: PMNode) => {
        dom.setAttribute('data-open', String(n.attrs.open))
        render(Boolean(n.attrs.open))
      }
      paint(node)
      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type !== node.type) return false
          current = updated
          paint(updated)
          return true
        },
        stopEvent: (event) => button.contains(event.target as globalThis.Node),
        ignoreMutation: (m) =>
          m.type !== 'selection' &&
          (button.contains(m.target) || m.target === dom),
      }
    }
  },

  addCommands() {
    return {
      setToggle:
        () =>
        ({ tr }) =>
          toToggle(tr, tr.selection.$from.before()),
    }
  },
})

export const ToggleTitle = Node.create({
  name: TOGGLE_TITLE,
  content: 'inline*',
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-toggle-title]' }, { tag: 'summary' }]
  },

  renderHTML() {
    // Le texte après le triangle de 24 px, à 30 px du bord (comme les listes).
    return ['div', { 'data-toggle-title': '', class: 'pl-[30px]' }, 0]
  },
})

export const ToggleContent = Node.create({
  name: TOGGLE_CONTENT,
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-toggle-content]' }]
  },

  renderHTML() {
    // Les enfants en retrait de 32 px ; leur padding fait l'espacement, comme
    // sur la page (`NOTE_PROSE`) — 16 px du titre au texte du premier.
    return [
      'div',
      {
        'data-toggle-content': '',
        class: 'mt-2 flex flex-col pl-8',
      },
      0,
    ]
  },
})

/**
 * Le clavier du menu dépliant (relevé Notion §4.3–4.4) :
 * - Entrée dans le titre : ouvert, le premier enfant (le texte après le
 *   curseur y descend) ; fermé, un bloc texte après le menu ;
 * - Entrée sur un enfant vide : un autre enfant ;
 * - Retour arrière sur le dernier enfant vide : il sort du menu ; seul
 *   enfant, le curseur remonte au titre ;
 * - Retour arrière en tête du premier enfant : son texte rejoint le titre ;
 * - Retour arrière en tête du titre : le menu redevient du texte, ses
 *   enfants le suivent ;
 * - `> ` en tête d'un paragraphe : un menu dépliant.
 */
export const toggleKeys = Extension.create({
  name: 'toggleKeys',
  // Avant les listes et le clavier de base, avant la citation pour `> `.
  priority: 150,

  addKeyboardShortcuts() {
    const editor = this.editor
    const enterTitle = () => {
      const { $from, empty } = editor.state.selection
      if (!empty || $from.parent.type.name !== TOGGLE_TITLE) return false
      const toggle = $from.node(-1)
      const rest = $from.parent.content.cut($from.parentOffset)
      const children = toggle.child(1)
      // Un menu neuf n'a qu'un enfant vide : c'est lui qu'on remplit.
      const blank =
        children.childCount === 1 &&
        children.firstChild?.type.name === 'paragraph' &&
        !children.firstChild.content.size
      return editor.commands.command(({ tr }) => {
        tr.delete($from.pos, $from.end())
        const at = toggle.attrs.open
          ? tr.mapping.map($from.after()) + 1
          : tr.mapping.map($from.after(-1))
        const paragraph = editor.schema.nodes.paragraph.create(null, rest)
        if (toggle.attrs.open && blank)
          tr.replaceWith(at, at + children.child(0).nodeSize, paragraph)
        else tr.insert(at, paragraph)
        tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView()
        return true
      })
    }
    const backspaceTitle = () => {
      const { $from, empty } = editor.state.selection
      if (!empty || $from.parent.type.name !== TOGGLE_TITLE) return false
      if ($from.parentOffset !== 0) return false
      const toggle = $from.node(-1)
      const start = $from.before(-1)
      const children: PMNode[] = []
      toggle.child(1).forEach((child) => children.push(child))
      return editor.commands.command(({ tr }) => {
        const paragraph = editor.schema.nodes.paragraph.create(
          null,
          $from.parent.content,
        )
        tr.replaceWith(
          start,
          start + toggle.nodeSize,
          Fragment.from([paragraph, ...children]),
        )
        tr.setSelection(TextSelection.create(tr.doc, start + 1))
        return true
      })
    }
    const backspaceFirstChild = () => {
      const { $from, empty } = editor.state.selection
      if (!empty || $from.parentOffset !== 0 || $from.depth < 3) return false
      if ($from.parent.type.name !== 'paragraph') return false
      const content = $from.node(-1)
      if (content.type.name !== TOGGLE_CONTENT || $from.index(-1) !== 0)
        return false
      const titleEnd = $from.before(-1) - 1
      return editor.commands.command(({ tr }) => {
        const start = $from.before()
        const end = start + $from.parent.nodeSize
        if (content.childCount === 1)
          tr.replaceWith(start, end, editor.schema.nodes.paragraph.create())
        else tr.delete(start, end)
        tr.insert(titleEnd, $from.parent.content)
        tr.setSelection(TextSelection.create(tr.doc, titleEnd))
        return true
      })
    }
    return {
      Enter: () => enterTitle() || enterInContainer(editor, [TOGGLE_CONTENT]),
      Backspace: () =>
        backspaceTitle() ||
        backspaceOutOf(editor, [TOGGLE_CONTENT], {
          outer: 1,
          onlyChild: ($from) =>
            editor.commands.setTextSelection($from.before(-1) - 1),
        }) ||
        backspaceFirstChild(),
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range }) => {
          const $start = state.doc.resolve(range.from)
          if ($start.parent.type.name !== 'paragraph') return null
          const { tr } = state
          tr.delete(range.from, range.to)
          if (!toToggle(tr, $start.before())) return null
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [foldGuard('toggleFolds', closedToggles)]
  },
})
