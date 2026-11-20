import { mergeAttributes, Node } from '@tiptap/core'

import { TEXT_ITEM, TEXT_LIST, textChildren } from '../text-children'
import type { BlockSpec } from './types'

/**
 * Le paragraphe qui a des enfants (cf. `../text-children`) : une liste
 * invisible, sans marqueur, dont chaque élément porte son paragraphe puis
 * ses blocs enfants, en retrait de 30 px (relevé Notion, 18/11). Pas
 * d'entrée au menu « / » : on y vient par Tab.
 */
const TextList = Node.create({
  name: TEXT_LIST,
  group: 'block',
  content: `${TEXT_ITEM}+`,

  parseHTML() {
    return [{ tag: `div[data-type="${TEXT_LIST}"]` }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': TEXT_LIST }),
      0,
    ]
  },
})

const TextItem = Node.create({
  name: TEXT_ITEM,
  // Son texte est un paragraphe, puis ses enfants. Le schéma accepte tout
  // bloc en tête, le temps d'une transaction : un paragraphe parent
  // transformé (titre, code…) se défait ensuite (`normalizeTextChildren`).
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: `div[data-type="${TEXT_ITEM}"]` }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': TEXT_ITEM }),
      0,
    ]
  },
})

export const textChildrenBlock: BlockSpec = {
  name: TEXT_LIST,
  nodes: [TEXT_LIST, TEXT_ITEM],
  extensions: () => [TextList, TextItem, textChildren],
  list: { item: TEXT_ITEM, marker: 0 },
}
