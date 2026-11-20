import { NodeSelection } from '@tiptap/pm/state'
import { Lightbulb } from 'lucide-react'

import { EXAMPLE_BOX, ExampleBoxNode, markFresh } from '../example-node'
import { placeBlock } from './place-block'
import type { BlockSpec } from './types'

/**
 * L'exemple dans le texte (cf. `../example-node`) : `/Exemple` pose un
 * encadré, son formulaire ouvert. L'exemple attaché à un passage, lui, naît
 * d'une sélection (la barre de sélection), en annotation.
 */
export const exampleBlock: BlockSpec = {
  name: EXAMPLE_BOX,
  nodes: [EXAMPLE_BOX],
  extensions: ({ exampleView }) => [
    ExampleBoxNode.configure({ view: exampleView }),
  ],
  items: [
    {
      id: 'example',
      label: 'Exemple',
      section: 'learn',
      aliases: ['exemple', 'example', 'cas', 'illustration'],
      icon: Lightbulb,
      action: {
        kind: 'insert',
        run: (editor, range) => {
          const id = crypto.randomUUID()
          markFresh(id)
          placeBlock(
            editor,
            range,
            editor.schema.nodes[EXAMPLE_BOX].create({ id }),
            (doc, at) => NodeSelection.create(doc, at),
          )
        },
      },
    },
  ],
}
