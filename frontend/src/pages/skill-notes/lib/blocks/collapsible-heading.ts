import { headingFold } from '../heading-fold'
import { HEADING, HEADING_LEVELS, HEADING_ICONS } from './heading'
import type { BlockItem, BlockSpec } from './types'

/**
 * Les titres dépliants 1–3 (cf. `../heading-fold`) : des titres (le nœud
 * `heading`) marqués `collapsible`. `# > `, `## > `, `### > ` en début de
 * ligne. Leur placeholder est celui des titres.
 */
export const collapsibleHeadingBlock: BlockSpec = {
  name: 'collapsibleHeading',
  nodes: [],
  extensions: () => [headingFold],
  items: HEADING_LEVELS.map((level): BlockItem => ({
    id: `collapsible-heading-${level}`,
    label: `Titre dépliant ${level}`,
    section: 'blocks',
    aliases: [
      `h${level}`,
      `titre ${level}`,
      'titre depliant',
      'toggle heading',
      'depliant',
      'heading',
    ],
    icon: HEADING_ICONS[level],
    markdown: `${'#'.repeat(level)} >`,
    action: {
      kind: 'transform',
      apply: (c) =>
        c.setNode(HEADING, { level, collapsible: true, collapsed: false }),
    },
  })),
}
