import { InputRule } from '@tiptap/core'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { NodeSelection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Sigma, SquareRadical } from 'lucide-react'

import { MathView } from '../../ui/blocks/math-view'
import { placeBlock } from './place-block'
import type { BlockSpec } from './types'

/**
 * L'équation (KaTeX, `@tiptap/extension-mathematics`) : en bloc entier
 * (`blockMath`, centrée) ou dans le texte (`inlineMath`). Le nœud ne porte
 * que son LaTeX (`latex`) ; la vue (`MathView`) le rend et l'édite.
 */
export const BLOCK_MATH = 'blockMath'
export const INLINE_MATH = 'inlineMath'

/** La vue React : elle gère son champ, ProseMirror n'a rien à relire. */
const view = () =>
  ReactNodeViewRenderer(MathView, { ignoreMutation: () => true })

const NotesBlockMath = BlockMath.extend({ addNodeView: view })

/**
 * `$…$` tapé dans le texte devient une équation en ligne (Notion) ; le `$$…$$`
 * de TipTap reste. Pas de `$` collé à un mot ou échappé avant, pas d'espace
 * juste à l'intérieur : « 5 $ et 10 $ » reste du texte.
 */
const DOLLARS = /(?<![$\w\\])\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$$/

const NotesInlineMath = InlineMath.extend({
  addNodeView: view,
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      new InputRule({
        find: DOLLARS,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex: match[1] }),
          )
        },
      }),
    ]
  },
})

export const equationBlock: BlockSpec = {
  name: BLOCK_MATH,
  nodes: [BLOCK_MATH, INLINE_MATH],
  extensions: () => [NotesBlockMath, NotesInlineMath],
  items: [
    {
      id: 'equation',
      label: 'Équation',
      section: 'blocks',
      aliases: ['equation', 'math', 'latex', 'tex', 'katex', 'formule'],
      icon: Sigma,
      action: {
        kind: 'insert',
        // Sélectionnée, l'équation neuve ouvre son champ.
        run: (editor, range) =>
          placeBlock(
            editor,
            range,
            editor.schema.nodes[BLOCK_MATH].create({ latex: '' }),
            (doc, at) => NodeSelection.create(doc, at),
          ),
      },
    },
    {
      id: 'equation-inline',
      label: 'Équation en ligne',
      section: 'inline',
      aliases: ['equation', 'math', 'latex', 'tex', 'inline', 'en ligne'],
      icon: SquareRadical,
      action: {
        kind: 'insert',
        run: (editor, range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .command(({ tr }) => {
              tr.insert(
                range.from,
                editor.schema.nodes[INLINE_MATH].create({ latex: '' }),
              )
              tr.setSelection(NodeSelection.create(tr.doc, range.from))
              return true
            })
            .run(),
      },
    },
  ],
}
