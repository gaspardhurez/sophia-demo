import { mergeAttributes, Node, wrappingInputRule } from '@tiptap/core'
import { Quote } from 'lucide-react'

import type { BlockSpec } from './types'

/**
 * La citation : celle de StarterKit, mais `" ` et `| ` en début de ligne
 * (Notion) — `> ` est au toggle. StarterKit n'exposant pas son nœud, on le
 * redéclare à l'identique (commandes `setBlockquote`, `toggleBlockquote`,
 * `unsetBlockquote`, ⇧⌘B) ; Retour arrière et Entrée : `../keymap`.
 */
const Blockquote = Node.create({
  name: 'blockquote',
  content: 'block+',
  group: 'block',
  defining: true,

  parseHTML() {
    return [{ tag: 'blockquote' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setBlockquote:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleBlockquote:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetBlockquote:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-b': () => this.editor.commands.toggleBlockquote() }
  },

  addInputRules() {
    // `"` aussi en guillemets typographiques, si le système les substitue.
    return [wrappingInputRule({ find: /^\s*["“”|]\s$/, type: this.type })]
  },
})

export const blockquoteBlock: BlockSpec = {
  name: 'blockquote',
  nodes: ['blockquote'],
  starterKit: { blockquote: false },
  extensions: () => [Blockquote],
  items: [
    {
      id: 'quote',
      label: 'Citation',
      section: 'blocks',
      aliases: ['citation', 'quote', 'blockquote'],
      icon: Quote,
      markdown: '"',
      action: { kind: 'transform', apply: (c) => c.setBlockquote() },
    },
  ],
  placeholder: { text: 'Citation vide' },
}
