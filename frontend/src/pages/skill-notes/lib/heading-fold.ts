import { Extension, InputRule } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { HEADING } from './blocks/heading'
import { type Fold, foldGuard } from './fold'
import { foldButton } from './fold-button'

/**
 * Les titres dépliants (relevé Notion §3, « Titre dépliant 1–3 ») : un titre
 * précédé d'un triangle qui replie ce qui le suit jusqu'au prochain titre de
 * niveau égal ou supérieur, dans le même conteneur (la page, une colonne, un
 * menu dépliant…). Le document n'est pas restructuré : deux attributs du
 * titre (`collapsible`, `collapsed`, écrits dans le document) et une
 * décoration qui masque les blocs repliés.
 */

/** Les sections repliées, conteneur par conteneur. */
export function headingFolds(doc: PMNode): Fold[] {
  const folds: Fold[] = []
  const scan = (parent: PMNode, start: number) => {
    // Le titre replié en cours : son niveau, le début de sa section.
    let level = 0
    let from = 0
    const close = (to: number) => {
      if (to > from) folds.push({ from, to, before: from - 1 })
      level = 0
    }
    let at = start
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i)
      const own =
        child.type.name === HEADING ? (child.attrs.level as number) : 0
      if (level && own && own <= level) close(at)
      if (!level) {
        if (own && child.attrs.collapsible && child.attrs.collapsed) {
          level = own
          from = at + child.nodeSize
        } else if (!child.isTextblock && !child.isAtom) scan(child, at + 1)
      }
      at += child.nodeSize
    }
    if (level) close(at)
  }
  scan(doc, 0)
  return folds
}

const decorations = (doc: PMNode) => {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== HEADING) return !node.isTextblock
    if (!node.attrs.collapsible) return false
    const collapsed = Boolean(node.attrs.collapsed)
    found.push(
      Decoration.widget(
        pos + 1,
        (view, getPos) => {
          const { button, render } = foldButton(() => {
            const at = getPos()
            const heading =
              at === undefined ? null : view.state.doc.nodeAt(at - 1)
            if (at === undefined || heading?.type.name !== HEADING) return
            // Replier ne s'annule pas : ce n'est pas une écriture.
            view.dispatch(
              view.state.tr
                .setNodeAttribute(at - 1, 'collapsed', !heading.attrs.collapsed)
                .setMeta('addToHistory', false),
            )
          })
          render(!collapsed)
          return button
        },
        {
          side: -1,
          key: `fold-${collapsed}`,
          ignoreSelection: true,
          stopEvent: () => true,
        },
      ),
    )
    return false
  })
  for (const fold of headingFolds(doc)) {
    for (let pos = fold.from; pos < fold.to;) {
      const node = doc.nodeAt(pos)
      if (!node) break
      found.push(Decoration.node(pos, pos + node.nodeSize, { class: 'hidden' }))
      pos += node.nodeSize
    }
  }
  return DecorationSet.create(doc, found)
}

export const headingFold = Extension.create({
  name: 'headingFold',
  // Avant la citation pour `> `, avant le clavier de base pour Entrée.
  priority: 150,

  addGlobalAttributes() {
    return [
      {
        types: [HEADING],
        attributes: {
          collapsible: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el) => el.hasAttribute('data-collapsible'),
            // Le texte après le triangle, à 30 px du bord (menu dépliant).
            renderHTML: (attrs) =>
              attrs.collapsible
                ? { 'data-collapsible': '', class: 'relative pl-[30px]' }
                : {},
          },
          collapsed: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el) => el.hasAttribute('data-collapsed'),
            renderHTML: (attrs) =>
              attrs.collapsed ? { 'data-collapsed': '' } : {},
          },
        },
      },
    ]
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    return {
      // Entrée en fin d'un titre replié : un bloc ne peut naître « après la
      // section » (tout ce qui suit le titre jusqu'au prochain titre en fait
      // partie) — la section se déplie, le bloc texte vient sous le titre.
      Enter: () => {
        const { $from, empty } = editor.state.selection
        const { parent } = $from
        if (!empty || parent.type.name !== HEADING || !parent.attrs.collapsed)
          return false
        if ($from.parentOffset !== parent.content.size) return false
        const at = $from.after()
        return editor.commands.command(({ tr }) => {
          tr.setNodeAttribute($from.before(), 'collapsed', false)
          tr.insert(at, editor.schema.nodes.paragraph.create())
          tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView()
          return true
        })
      },
    }
  },

  addInputRules() {
    return [
      // `# > ` : `# ` fait le titre, `> ` en tête du titre le rend dépliant.
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range }) => {
          const $start = state.doc.resolve(range.from)
          const heading = $start.parent
          if (heading.type.name !== HEADING || heading.attrs.collapsible)
            return null
          state.tr
            .delete(range.from, range.to)
            .setNodeAttribute($start.before(), 'collapsible', true)
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('headingFold'),
        state: {
          init: (_, state) => decorations(state.doc),
          apply: (tr, set) => (tr.docChanged ? decorations(tr.doc) : set),
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
      foldGuard('headingFoldGuard', headingFolds),
    ]
  },
})
