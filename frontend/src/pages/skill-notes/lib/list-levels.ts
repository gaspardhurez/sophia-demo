import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { isItem, isList } from './block-unit'
import { TEXT_LIST } from './text-children'

/**
 * Le niveau d'une liste, qui choisit ses marqueurs (`data-level`, lu par
 * `NOTE_PROSE`) : 1 → « 1. » et •, 2 → « a. » et ◦, 3 → « i. » et ▪, puis
 * on recommence.
 *
 * Une liste rangée sous un élément n'en est la **suite** (un niveau de plus)
 * que si elle le prolonge directement : juste sous son texte, ou sous une
 * autre liste qui le prolonge. Dès qu'un autre bloc s'intercale (un
 * paragraphe, un code…), c'est une liste nouvelle, qui repart au niveau 1 —
 * un écart à Notion, qui compte les niveaux d'imbrication quoi qu'il y ait
 * entre eux.
 */
function levels(doc: PMNode) {
  const found: Decoration[] = []
  // `level` : celui de la liste de `parent` quand c'est un élément.
  const walk = (parent: PMNode, offset: number, level: number | null) => {
    let run = level !== null
    parent.forEach((child, o, i) => {
      const pos = offset + o
      // Un paragraphe qui a des enfants n'est pas une liste à l'œil : ses
      // enfants repartent au niveau 1 (relevé Notion, 18/11 : une puce sous
      // un paragraphe est « • »).
      const text = child.type.name === TEXT_LIST
      if (i > 0 && (!isList(child) || text)) run = false
      if (text) child.forEach((item, io) => walk(item, pos + 1 + io + 1, null))
      else if (isList(child)) {
        const own = run && i > 0 && level !== null ? (level % 3) + 1 : 1
        found.push(
          Decoration.node(pos, pos + child.nodeSize, {
            'data-level': String(own),
          }),
        )
        child.forEach((item, io) =>
          walk(item, pos + 1 + io + 1, isItem(item) ? own : null),
        )
      } else if (!child.isTextblock && !child.isAtom) walk(child, pos + 1, null)
    })
  }
  walk(doc, 0, null)
  return DecorationSet.create(doc, found)
}

export const listLevels = Extension.create({
  name: 'listLevels',
  addProseMirrorPlugins() {
    const plugin: Plugin<DecorationSet> = new Plugin({
      state: {
        init: (_, state) => levels(state.doc),
        apply: (tr, set) => (tr.docChanged ? levels(tr.doc) : set),
      },
      props: { decorations: (state) => plugin.getState(state) },
    })
    return [plugin]
  },
})
