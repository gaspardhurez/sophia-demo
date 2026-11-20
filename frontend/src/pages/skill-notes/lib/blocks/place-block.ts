import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type Selection, TextSelection } from '@tiptap/pm/state'

/**
 * Le menu « / » pose un bloc à part (tableau, équation) : le « / » et sa
 * requête retirés, le bloc **remplace** le paragraphe s'il est resté vide,
 * sinon se place juste après lui. `select` dit où mettre la sélection, d'après
 * la position du bloc posé ; par défaut, le premier endroit où écrire dedans.
 */
export function placeBlock(
  editor: Editor,
  range: { from: number; to: number },
  node: PMNode,
  select?: (doc: PMNode, at: number) => Selection,
) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .command(({ tr }) => {
      const $p = tr.doc.resolve(range.from)
      const empty = $p.parent.content.size === 0
      const at = empty ? $p.before() : $p.after()
      if (empty) tr.replaceWith($p.before(), $p.after(), node)
      else tr.insert(at, node)
      tr.setSelection(
        select?.(tr.doc, at) ?? TextSelection.near(tr.doc.resolve(at + 1)),
      )
      tr.scrollIntoView()
      return true
    })
    .run()
}
