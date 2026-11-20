import { Pilcrow } from 'lucide-react'

import type { BlockSpec } from './types'

export const PARAGRAPH = 'paragraph'

/** Le texte (StarterKit). Absent du menu « / », cible de « Transformer en ». */
export const paragraphBlock: BlockSpec = {
  name: PARAGRAPH,
  nodes: [PARAGRAPH],
  items: [
    {
      id: 'text',
      label: 'Texte',
      section: 'blocks',
      aliases: ['texte', 'text', 'paragraphe', 'paragraph'],
      icon: Pilcrow,
      hideInSlash: true,
      action: { kind: 'transform', apply: (c) => c.setParagraph() },
    },
  ],
  // Aussi l'invite de la page vierge.
  placeholder: { text: 'Écris, colle tes notes, ou « / » pour un bloc' },
}
