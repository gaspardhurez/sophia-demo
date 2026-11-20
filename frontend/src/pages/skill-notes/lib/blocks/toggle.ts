import { ListCollapse } from 'lucide-react'

import {
  TOGGLE,
  TOGGLE_CONTENT,
  TOGGLE_TITLE,
  Toggle,
  ToggleContent,
  ToggleTitle,
  toggleKeys,
} from '../toggle'
import type { BlockSpec } from './types'

/**
 * Le menu dépliant (cf. `../toggle`) : `> ` en début de ligne. Ses enfants
 * sont des blocs de la page (questions comprises).
 */
export const toggleBlock: BlockSpec = {
  name: TOGGLE,
  nodes: [TOGGLE, TOGGLE_TITLE, TOGGLE_CONTENT],
  extensions: () => [Toggle, ToggleTitle, ToggleContent, toggleKeys],
  items: [
    {
      id: 'toggle',
      label: 'Menu dépliant',
      section: 'blocks',
      aliases: ['toggle', 'details', 'depliant', 'menu', 'repliable'],
      icon: ListCollapse,
      markdown: '>',
      action: { kind: 'transform', apply: (c) => c.setToggle() },
    },
  ],
  placeholder: { text: 'Menu dépliant' },
  containers: [TOGGLE_CONTENT],
}
