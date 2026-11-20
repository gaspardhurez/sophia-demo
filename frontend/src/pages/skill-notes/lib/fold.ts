import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state'

/**
 * Ce qu'un bloc replié cache (le contenu d'un menu dépliant fermé, la section
 * d'un titre dépliant replié) : de `from` à `to`. `before` : la fin du titre
 * qui le replie, où revient un curseur qui remonte.
 */
export interface Fold {
  from: number
  to: number
  before: number
}

/**
 * Le curseur ne se pose jamais dans un pli : les flèches le font sauter par
 * dessus — après le pli en descendant, en fin du titre en remontant.
 */
export function foldGuard(name: string, foldsOf: (doc: PMNode) => Fold[]) {
  return new Plugin({
    key: new PluginKey(name),
    appendTransaction: (trs, before, state) => {
      const { selection, doc } = state
      if (!selection.empty || !trs.some((tr) => tr.selectionSet)) return null
      const head = selection.head
      const fold = foldsOf(doc).find((f) => f.from < head && head < f.to)
      if (!fold) return null
      const down = head > before.selection.head
      const next = down
        ? Selection.findFrom(doc.resolve(fold.to), 1, true)
        : null
      return state.tr.setSelection(
        next ?? TextSelection.create(doc, fold.before),
      )
    },
  })
}
