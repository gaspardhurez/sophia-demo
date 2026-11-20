import { mergeAttributes, Node } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { SeparatorHorizontal } from 'lucide-react'

import type { BlockSpec } from './types'

/**
 * Le nœud du séparateur, sans règle d'entrée : `---` est à `keymap.ts` (un
 * séparateur et un bloc texte dessous, relevé §4.1). Celui de StarterKit
 * convertirait aussi `***`, `___` et `—-`, que Notion laisse en texte.
 */
const HorizontalRule = Node.create({
  name: 'horizontalRule',
  group: 'block',
  parseHTML: () => [{ tag: 'hr' }],
  renderHTML: ({ HTMLAttributes }) => [
    'hr',
    mergeAttributes(
      {
        class:
          'm-0 h-[13px] shrink-0 cursor-pointer border-0 bg-[linear-gradient(var(--border),var(--border))] bg-size-[100%_1px] bg-center bg-no-repeat [&.ProseMirror-selectednode]:rounded-[4px] [&.ProseMirror-selectednode]:bg-primary/10',
      },
      HTMLAttributes,
    ),
  ],
})

/**
 * Le séparateur (relevé Notion §1.5) : un bloc de 13 px, un trait de 1 px
 * très léger au milieu, sur la largeur du texte ; tout le bloc se clique.
 */
export const dividerBlock: BlockSpec = {
  name: 'horizontalRule',
  nodes: ['horizontalRule'],
  extensions: () => [HorizontalRule],
  items: [
    {
      id: 'divider',
      label: 'Séparateur',
      section: 'blocks',
      aliases: ['separateur', 'divider', 'ligne', 'trait', 'hr', 'rule'],
      icon: SeparatorHorizontal,
      markdown: '---',
      action: {
        kind: 'insert',
        // Comme `---` : le séparateur à la place du bloc vide, un bloc texte
        // dessous où l'on continue (le menu n'appelle `run` que sur un
        // paragraphe vide).
        run: (editor, range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .command(({ tr }) => {
              const $p = tr.doc.resolve(range.from)
              const { nodes } = tr.doc.type.schema
              tr.replaceWith($p.before(), $p.after(), [
                nodes.horizontalRule.create(),
                nodes.paragraph.create(),
              ])
              tr.setSelection(TextSelection.create(tr.doc, $p.before() + 2))
              tr.scrollIntoView()
              return true
            })
            .run(),
      },
    },
  ],
}
