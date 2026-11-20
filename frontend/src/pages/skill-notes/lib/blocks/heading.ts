import { Heading1, Heading2, Heading3 } from 'lucide-react'

import type { BlockItem, BlockSpec } from './types'

export const HEADING = 'heading'
export const HEADING_LEVELS = [1, 2, 3] as const

export const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3 }

/**
 * Les titres 1–3 (StarterKit) : `# `, `## `, `### ` en début de ligne ;
 * ⌘⌥1, 2, 3. De la mise en forme seulement : ils ne découpent rien.
 */
export const headingBlock: BlockSpec = {
  name: HEADING,
  nodes: [HEADING],
  starterKit: { heading: { levels: [...HEADING_LEVELS] } },
  items: HEADING_LEVELS.map((level): BlockItem => ({
    id: `heading-${level}`,
    label: `Titre ${level}`,
    section: 'blocks',
    aliases: [`h${level}`, `heading ${level}`, 'titre', 'heading'],
    icon: HEADING_ICONS[level],
    markdown: '#'.repeat(level),
    // Un titre simple : un titre dépliant le redevient (cf. `heading-fold`).
    action: {
      kind: 'transform',
      apply: (c) =>
        c.setNode(HEADING, { level, collapsible: false, collapsed: false }),
    },
  })),
  placeholder: {
    text: (node) => `Titre ${node.attrs.level as number}`,
    always: true,
  },
}
