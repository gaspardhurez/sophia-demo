import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

import { markerOf, type Unit } from './block-unit'

/**
 * Où vivent les poignées « + ⋮⋮ » d'un bloc (annexe §2), en coordonnées du
 * client : `text`, son bord gauche — celui de son texte ; pour un élément de
 * liste, celui de son marqueur (sa puce : les poignées d'un sous-élément sont
 * donc décalées de son retrait) ; `top`, le haut des poignées (24 px de haut).
 *
 * Elles sont centrées sur la **première ligne** du bloc, quel qu'en soit le
 * type : la ligne se lit dans le DOM (padding du haut + interligne du premier
 * bloc de texte qu'il contient), jamais en dur. Exceptions : le code et
 * l'encadré — le haut du bloc + 8 px ; un bloc sans texte (séparateur,
 * image, question) — centré s'il est mince, sinon le haut + 8 px.
 */
export const HANDLE_HEIGHT = 24

/** Les blocs dont la poignée se cale sur le haut, pas sur une ligne. */
const TOP_ALIGNED = new Set(['codeBlock', 'callout'])

export function handleSpot(
  view: EditorView,
  { pos, node, list }: Unit,
): { text: number; top: number } | null {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  const box = dom.getBoundingClientRect()
  const text = box.left - markerOf(list)
  if (TOP_ALIGNED.has(node.type.name)) return { text, top: box.top + 8 }

  const line = firstTextblock(pos, node)
  const lineDom = line === null ? null : view.nodeDOM(line)
  if (!(lineDom instanceof HTMLElement)) {
    // Sans texte : centré sur un bloc mince (le trait du séparateur).
    const height = box.bottom - box.top
    return height <= 2 * HANDLE_HEIGHT
      ? { text, top: box.top + (height - HANDLE_HEIGHT) / 2 }
      : { text, top: box.top + 8 }
  }
  const style = getComputedStyle(lineDom)
  const lineBox = lineDom.getBoundingClientRect()
  const height =
    style.lineHeight === 'normal'
      ? parseFloat(style.fontSize) * 1.2
      : parseFloat(style.lineHeight)
  const center =
    lineBox.top +
    parseFloat(style.paddingTop) +
    parseFloat(style.borderTopWidth) +
    height / 2
  return { text, top: center - HANDLE_HEIGHT / 2 }
}

/** La position du premier bloc de texte de `node` (lui-même compris). */
function firstTextblock(pos: number, node: PMNode): number | null {
  if (node.isTextblock) return pos
  let found: number | null = null
  node.descendants((child, offset) => {
    if (found !== null) return false
    if (child.isTextblock) found = pos + 1 + offset
    return found === null && !child.isAtom
  })
  return found
}
