import type { Editor } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Le clavier dans un conteneur de blocs enfants (menu dépliant, encadré ;
 * relevé Notion §4.3) : on n'en sort pas par Entrée, on en sort par Retour
 * arrière.
 */

/** Le paragraphe vide du curseur, enfant direct d'un de ces conteneurs. */
function emptyChild(editor: Editor, containers: string[]): ResolvedPos | null {
  const { $from, empty } = editor.state.selection
  if (!empty || $from.depth < 1) return null
  const { parent } = $from
  if (parent.type.name !== 'paragraph' || parent.content.size) return null
  return containers.includes($from.node(-1).type.name) ? $from : null
}

/** Entrée sur un enfant vide : un autre enfant vide (on reste dedans). */
export function enterInContainer(editor: Editor, containers: string[]) {
  return emptyChild(editor, containers) ? editor.commands.splitBlock() : false
}

/**
 * Retour arrière sur le dernier enfant, vide : il sort du bloc et se pose
 * juste après lui. `outer` : le nombre de niveaux entre le conteneur et le
 * bloc dont on sort (le contenu d'un menu dépliant est dans le menu : 1).
 * Seul enfant : `onlyChild` décide.
 */
export function backspaceOutOf(
  editor: Editor,
  containers: string[],
  {
    outer,
    onlyChild,
  }: { outer: number; onlyChild: ($from: ResolvedPos) => boolean },
) {
  const $from = emptyChild(editor, containers)
  if (!$from) return false
  const box = $from.node(-1)
  if ($from.index(-1) !== box.childCount - 1) return false
  if (box.childCount === 1) return onlyChild($from)
  const after = $from.after($from.depth - 1 - outer)
  return editor.commands.command(({ tr }) => {
    const start = $from.before()
    tr.delete(start, start + $from.parent.nodeSize)
    const at = tr.mapping.map(after)
    tr.insert(at, $from.parent.type.create())
    tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView()
    return true
  })
}
