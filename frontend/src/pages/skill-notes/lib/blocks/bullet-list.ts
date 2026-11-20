import { List } from 'lucide-react'

import { type BlockSpec, LIST_MARKER } from './types'

/** La liste à puces (StarterKit) : `- `, `* ` ou `+ ` en début de ligne. */
export const bulletListBlock: BlockSpec = {
  name: 'bulletList',
  nodes: ['bulletList'],
  items: [
    {
      id: 'bullet-list',
      label: 'Liste à puces',
      section: 'blocks',
      aliases: ['puces', 'liste', 'bullet', 'list', 'ul'],
      icon: List,
      markdown: '-',
      action: { kind: 'transform', apply: (c) => c.toggleBulletList() },
    },
  ],
  list: { item: 'listItem', marker: LIST_MARKER },
  placeholder: { text: 'Liste' },
}
