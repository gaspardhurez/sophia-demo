import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

import { PARAGRAPH } from './blocks/paragraph'

/** La place d'un bloc dans le document : de son début à sa fin. */
export interface BlockRange {
  from: number
  to: number
}

/** Les listes et leurs éléments : une dictée ne s'y glisse pas (elle y
 *  deviendrait une sous-liste), elle se pose après la liste entière. */
const LISTS = new Set([
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
])

/**
 * Où poser une dictée, d'après le curseur (`pos`) : **une position entre
 * deux blocs**, où un bloc de puces est permis.
 *
 * - Curseur dans un bloc de texte vide : **avant** lui — les puces
 *   prennent sa place, et la ligne vide reste dessous, où l'on continue
 *   d'écrire (ou de dicter).
 * - Curseur dans un bloc de texte écrit : **après** lui, sans le couper —
 *   une phrase n'est pas tranchée par une dictée.
 * - Dans une liste : après la liste entière. Dans une colonne, un
 *   encadré, un dépliant : à l'intérieur, au plus près du curseur.
 *
 * Rend `null` si rien ne convient (ne devrait pas arriver : le document
 * accepte des blocs).
 */
export function dictationSpot(doc: PMNode, pos: number): number | null {
  const list = doc.type.schema.nodes.bulletList
  let $at = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  let at = $at.pos
  if ($at.parent.isTextblock) {
    at = $at.parent.content.size === 0 ? $at.before() : $at.after()
    $at = doc.resolve(at)
  }
  for (;;) {
    const parent = $at.parent
    const index = $at.index()
    if (
      !LISTS.has(parent.type.name) &&
      parent.canReplaceWith(index, index, list)
    )
      return at
    if ($at.depth === 0) return null
    at = $at.after()
    $at = doc.resolve(at)
  }
}

/**
 * Pose les puces d'une dictée **en un bloc de puces**, à `at` (cf.
 * `dictationSpot`, recalculé ici : le document a pu changer depuis).
 *
 * Une seule transaction, dans l'historique : ⌘Z la retire comme une frappe.
 * Rend la place du bloc, pour « Annuler la dictée » ; `null` s'il n'y a
 * rien à poser.
 */
export function insertBullets(
  editor: Editor,
  at: number,
  bullets: string[],
): BlockRange | null {
  const lines = bullets.map((b) => b.trim()).filter(Boolean)
  if (!lines.length) return null
  const { state } = editor
  const { schema } = state
  const from = dictationSpot(state.doc, at)
  if (from === null) return null
  const list = schema.nodes.bulletList.create(
    null,
    lines.map((line) =>
      schema.nodes.listItem.create(
        null,
        schema.nodes[PARAGRAPH].create(null, schema.text(line)),
      ),
    ),
  )
  editor.view.dispatch(state.tr.insert(from, list).scrollIntoView())
  return { from, to: from + list.nodeSize }
}

/**
 * La place d'un bloc après une transaction : elle suit ce qui s'écrit
 * avant ou dedans ; `null` si le bloc a disparu (supprimé, remplacé).
 */
export function mapRange(
  range: BlockRange,
  tr: Transaction,
): BlockRange | null {
  if (!tr.docChanged) return range
  const from = tr.mapping.mapResult(range.from, 1)
  const to = tr.mapping.mapResult(range.to, -1)
  if (from.deleted || to.deleted || to.pos <= from.pos) return null
  return { from: from.pos, to: to.pos }
}

/**
 * Retire le bloc d'une dictée (« Annuler la dictée »), s'il est encore là,
 * entier, à sa place : un bloc de puces qui commence et finit où on l'a
 * suivi. Sinon, rien — on ne retire pas autre chose à sa place.
 */
export function removeBlock(editor: Editor, range: BlockRange): boolean {
  const { state } = editor
  const node = state.doc.nodeAt(range.from)
  if (
    !node ||
    node.type.name !== 'bulletList' ||
    range.from + node.nodeSize !== range.to
  )
    return false
  editor.view.dispatch(state.tr.delete(range.from, range.to))
  return true
}

/**
 * Le surlignage d'un bloc que la dictée vient de poser (`prod/Notes`) : un
 * fond vert pâle, tenu 4 s, qui s'estompe en 0,6 s. Le vert est celui de la
 * palette des notes (`--note-text-green`, clair ou sombre), à 14 %.
 * Une animation, pas un style posé : ProseMirror ne voit pas de mutation
 * (cf. `flash`).
 */
export function flashDictation(editor: Editor, range: BlockRange) {
  const dom = editor.view.nodeDOM(range.from)
  if (!(dom instanceof HTMLElement)) return
  const green = (alpha: number) =>
    `color-mix(in oklch, var(--note-text-green, #448361) ${alpha}%, transparent)`
  const frame = (alpha: number) => ({
    backgroundColor: green(alpha),
    boxShadow: `0 0 0 4px ${green(alpha)}`,
    borderRadius: '6px',
  })
  dom.animate([frame(14), { ...frame(14), offset: 4 / 4.6 }, frame(0)], {
    duration: DICTATION_FLASH_MS,
    easing: 'ease-out',
  })
}

/** La durée du surlignage, et de « Annuler la dictée » (`prod/Notes` : 4 s,
 *  puis 0,6 s d'estompe). */
export const DICTATION_FLASH_MS = 4600
