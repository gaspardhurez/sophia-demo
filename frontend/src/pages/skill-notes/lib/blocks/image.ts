import { ImageIcon } from 'lucide-react'

import { IMAGE, ImageNode, imageDrop } from '../image-node'
import type { BlockSpec } from './types'

/**
 * L'image (cf. `../image-node`) : téléversée dans le dossier média de l'API.
 * `/Image` pose un bloc vide « Ajouter une image » ; coller ou déposer une
 * image la pose directement.
 */
export const imageBlock: BlockSpec = {
  name: IMAGE,
  nodes: [IMAGE],
  extensions: ({ imageView }) => [
    ImageNode.configure({ view: imageView }),
    imageDrop,
  ],
  items: [
    {
      id: 'image',
      label: 'Image',
      section: 'blocks',
      aliases: ['image', 'img', 'photo', 'picture', 'capture', 'media'],
      icon: ImageIcon,
      action: {
        kind: 'insert',
        // Le paragraphe du « / » devient le bloc vide.
        run: (editor, range) => {
          const $from = editor.state.doc.resolve(range.from)
          editor
            .chain()
            .focus()
            .insertContentAt(
              { from: $from.before(), to: $from.after() },
              { type: IMAGE },
            )
            .run()
        },
      },
    },
  ],
}
