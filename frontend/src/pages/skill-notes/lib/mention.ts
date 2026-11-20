import { type EditorState, PluginKey, type Transaction } from '@tiptap/pm/state'

import type { Resource } from '@/entities/resource'

import { fold } from './slash'
import {
  closeTrigger,
  type TriggerKey,
  triggerAt,
  triggerPlugin,
} from './trigger'

/**
 * Le menu « @ » des mentions (comme Notion) : son caractère et son filtre —
 * la règle d'ouverture est celle de tout menu tapé (`lib/trigger`) ; « a@b »
 * reste du texte (collé à un mot). On y mentionne les ressources du savoir.
 */

export const mentionKey: TriggerKey = new PluginKey('mentionMenu')

/** Fermer le menu (Échap, Tab) : le texte tapé reste. */
export const closeMention = (tr: Transaction) => closeTrigger(tr, mentionKey)

/** Le « @ » ouvert dans cet état, s'il y en a un. */
export const mentionAt = (state: EditorState) => triggerAt(state, mentionKey)

/**
 * Les ressources qui répondent à une requête, sans casse ni accents : celles
 * dont le titre commence par elle, puis celles dont le titre ou la partie la
 * contient ; à rang égal, l'ordre de la bibliothèque. Sans requête : toutes.
 */
export function mentionResults(
  resources: Resource[],
  query: string,
): Resource[] {
  const q = fold(query)
  if (!q) return resources
  const rank = (r: Resource) => {
    const title = fold(r.title)
    if (title.startsWith(q)) return 0
    if (title.includes(q) || fold(r.part ?? '').includes(q)) return 1
    return null
  }
  return resources
    .map((resource) => ({ resource, rank: rank(resource) }))
    .filter((r): r is { resource: Resource; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map(({ resource }) => resource)
}

/**
 * Le plugin qui suit le « @ » ouvert (cf. `mentionKey`). `resources` : les
 * ressources du savoir à l'instant — pas encore chargées, rien ne compte
 * pour rien.
 */
export const mentionPlugin = (resources: () => Resource[] | undefined) =>
  triggerPlugin({
    key: mentionKey,
    char: '@',
    hits: (query) => {
      const all = resources()
      return !all || mentionResults(all, query).length > 0
    },
  })
