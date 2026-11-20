import { type EditorState, PluginKey, type Transaction } from '@tiptap/pm/state'

import { BLOCK_SECTIONS, type BlockItem, SLASH_ITEMS } from './blocks'
import {
  closeTrigger,
  type TriggerKey,
  type TriggerQuery,
  triggerAt,
  triggerPlugin,
} from './trigger'

/**
 * Le menu « / » (relevé Notion §3) : son caractère et son filtre — la règle
 * d'ouverture et de fermeture est celle de tout menu tapé (`lib/trigger`).
 * Le menu (`ui/slash-menu`) n'en fait que l'affichage et le clavier.
 */

/** Le « / » ouvert : sa place, le curseur, ce qu'on a écrit entre les deux. */
export type SlashQuery = TriggerQuery

export const slashKey: TriggerKey = new PluginKey('slashMenu')

/** Fermer le menu (Échap, Tab) : le texte tapé reste. */
export const closeSlash = (tr: Transaction) => closeTrigger(tr, slashKey)

/** Le « / » ouvert dans cet état, s'il y en a un. */
export const slashAt = (state: EditorState) => triggerAt(state, slashKey)

/** Le plugin qui suit le « / » ouvert (cf. `slashKey`). */
export const slashPlugin = () =>
  triggerPlugin({
    key: slashKey,
    char: '/',
    hits: (query) => slashResults(query).length > 0,
  })

/** Pour filtrer : sans casse ni accents. */
export const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Les entrées du menu, section par section : l'ordre sans filtre. */
const ORDERED = BLOCK_SECTIONS.flatMap((section) =>
  SLASH_ITEMS.filter((item) => item.section === section),
)

const WORDS = new Map(
  ORDERED.map((item) => [
    item.id,
    { label: fold(item.label), aliases: item.aliases.map(fold) },
  ]),
)

/**
 * Ce qui répond à une requête, sans casse ni accents : le libellé ou un
 * alias (FR ou EN) qui commence par elle, puis ceux dont un mot commence par
 * elle (« num » trouve Liste numérotée, pas « ti » Question factuelle) ; à
 * rang égal, l'ordre du menu. Sans requête : tout le menu.
 */
export function slashResults(query: string): BlockItem[] {
  const q = fold(query)
  if (!q) return ORDERED
  const rank = (item: BlockItem) => {
    const { label, aliases } = WORDS.get(item.id)!
    const all = [label, ...aliases]
    if (all.some((w) => w.startsWith(q))) return 0
    if (all.some((w) => w.split(/\s+/).some((p) => p.startsWith(q)))) return 1
    return null
  }
  return ORDERED.map((item) => ({ item, rank: rank(item) }))
    .filter((r): r is { item: BlockItem; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.item)
}
