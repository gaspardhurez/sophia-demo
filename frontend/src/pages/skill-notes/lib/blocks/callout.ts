import { Lightbulb } from 'lucide-react'

import { CALLOUT, Callout, calloutKeys } from '../callout'
import type { BlockSpec } from './types'

/**
 * L'encadré (cf. `../callout`) : une icône et des blocs enfants (questions
 * comprises). Pas de raccourci Markdown (Notion non plus).
 */
export const calloutBlock: BlockSpec = {
  name: CALLOUT,
  nodes: [CALLOUT],
  extensions: () => [Callout, calloutKeys],
  items: [
    {
      id: 'callout',
      label: 'Encadré',
      section: 'blocks',
      aliases: ['encadre', 'callout', 'note', 'remarque', 'aside'],
      icon: Lightbulb,
      action: { kind: 'transform', apply: (c) => c.setCallout() },
    },
  ],
  containers: [CALLOUT],
}
