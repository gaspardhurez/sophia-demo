import { FileText } from 'lucide-react'

import {
  SKILL_LINK,
  SKILL_LINK_SESSION,
  SkillLinkNode,
} from '../skill-link-node'
import type { BlockSpec } from './types'

/**
 * Le lien vers un autre savoir (cf. `../skill-link-node`), en ligne : le
 * « / » retiré, le lien se pose au curseur et ouvre son sélecteur.
 */
export const skillLinkBlock: BlockSpec = {
  name: SKILL_LINK,
  nodes: [SKILL_LINK],
  extensions: ({ skillLinkView }) => [
    SkillLinkNode.configure({ view: skillLinkView }),
  ],
  items: [
    {
      id: 'skill-link',
      label: 'Lien vers un savoir',
      section: 'blocks',
      aliases: ['lien', 'savoir', 'skill', 'link', 'mention', 'page'],
      icon: FileText,
      action: {
        kind: 'insert',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: SKILL_LINK,
              attrs: { fresh: SKILL_LINK_SESSION },
            })
            .run()
        },
      },
    },
  ],
}
