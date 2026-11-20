import { Extension, wrappingInputRule } from '@tiptap/core'
import { ListOrdered } from 'lucide-react'

import { type BlockSpec, LIST_MARKER } from './types'

/** `a. ` en début de ligne : une liste numérotée aussi (Notion). */
const letterStart = Extension.create({
  name: 'orderedListLetter',
  addInputRules() {
    const type = this.editor.schema.nodes.orderedList
    return type ? [wrappingInputRule({ find: /^a\.\s$/, type })] : []
  },
})

/** La liste numérotée (StarterKit) : `1. ` ou `a. ` en début de ligne. */
export const orderedListBlock: BlockSpec = {
  name: 'orderedList',
  nodes: ['orderedList'],
  extensions: () => [letterStart],
  items: [
    {
      id: 'ordered-list',
      label: 'Liste numérotée',
      section: 'blocks',
      aliases: ['numerotee', 'liste', 'numbered', 'ordered', 'list', 'ol'],
      icon: ListOrdered,
      markdown: '1.',
      action: { kind: 'transform', apply: (c) => c.toggleOrderedList() },
    },
  ],
  list: { item: 'listItem', marker: LIST_MARKER },
  placeholder: { text: 'Liste' },
}
