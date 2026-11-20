import { type EditorState, PluginKey, type Transaction } from '@tiptap/pm/state'

import { fold } from './slash'
import {
  closeTrigger,
  type TriggerKey,
  type TriggerQuery,
  triggerAt,
  triggerPlugin,
} from './trigger'

/**
 * Le menu « : » des emojis (comme Notion) : son caractère, ses données, son
 * filtre — la règle d'ouverture est celle de tout menu tapé (`lib/trigger`).
 *
 * Il ne se montre qu'à deux caractères de requête : « 10:30 » ne l'ouvre
 * pas (collé à un mot), « Remarque : » non plus (le « : » suivi d'une
 * espace), et « :) » reste un smiley. On cherche en français et en anglais :
 * nom, mots-clés, et les raccourcis de GitHub, ceux qu'on tape dans Notion
 * (`:fire:`, `:+1:`). Un second « : » derrière un nom exact pose l'emoji
 * sans passer par le menu. Chaque résultat porte sa catégorie (celles de
 * Notion, `EMOJI_CATEGORIES`) : le menu complet les groupe.
 *
 * Les données viennent de `public/emoji/` (hors-ligne, cf. `emoji:sync`) et
 * ne se chargent qu'au premier « : » tapé : 1,4 Mo n'ont rien à faire dans
 * l'ouverture des notes.
 */

/** À partir de combien de caractères de requête le menu se montre. */
export const MIN_QUERY = 2

/**
 * Les catégories, dans l'ordre de Notion (activités avant voyages) ; les
 * smileys et les personnes n'en font qu'une. `groups` : ceux d'emojibase.
 */
export const EMOJI_CATEGORIES = [
  { id: 'people', label: 'Personnes', groups: [0, 1] },
  { id: 'nature', label: 'Animaux et nature', groups: [3] },
  { id: 'food', label: 'Nourriture et boissons', groups: [4] },
  { id: 'activities', label: 'Activités', groups: [6] },
  { id: 'travel', label: 'Voyages et lieux', groups: [5] },
  { id: 'objects', label: 'Objets', groups: [7] },
  { id: 'symbols', label: 'Symboles', groups: [8] },
  { id: 'flags', label: 'Drapeaux', groups: [9] },
] as const

export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number]['id']

const CATEGORY_OF = new Map<number, EmojiCategory>(
  EMOJI_CATEGORIES.flatMap((c) => c.groups.map((g) => [g, c.id] as const)),
)

export interface Emoji {
  emoji: string
  /** Son nom en français : l'infobulle. */
  label: string
  category: EmojiCategory
}

interface Entry extends Emoji {
  order: number
  /** Noms et raccourcis, repliés (sans casse, ni accents, ni « _ »). */
  names: string[]
  /** Mots-clés, repliés. */
  tags: string[]
}

interface Raw {
  label: string
  hexcode: string
  tags?: string[]
  emoji?: string
  unicode?: string
  group?: number
  order?: number
}

/** Replié pour chercher ; « coeur » trouve « cœur » (une ligature n'est pas un accent). */
const key = (text: string) =>
  fold(text).replace(/_/g, ' ').replace(/œ/g, 'oe').replace(/æ/g, 'ae')

let entries: Entry[] | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

/** Charger les données, une fois pour toutes. */
export function loadEmojis() {
  loading ??= Promise.all([
    fetch('/emoji/fr/data.json').then((r) => r.json() as Promise<Raw[]>),
    fetch('/emoji/en/compact.json').then((r) => r.json() as Promise<Raw[]>),
    fetch('/emoji/en/github.json').then(
      (r) => r.json() as Promise<Record<string, string | string[]>>,
    ),
  ])
    .then(([fr, en, github]) => {
      const english = new Map(en.map((e) => [e.hexcode, e]))
      entries = fr
        .filter((e) => e.group !== undefined && CATEGORY_OF.has(e.group))
        .map((e) => {
          const other = english.get(e.hexcode)
          const codes = [github[e.hexcode] ?? []].flat()
          return {
            emoji: e.emoji ?? e.unicode ?? '',
            label: e.label,
            category: CATEGORY_OF.get(e.group!)!,
            order: e.order ?? Infinity,
            names: [e.label, other?.label ?? '', ...codes]
              .filter(Boolean)
              .map(key),
            tags: [...(e.tags ?? []), ...(other?.tags ?? [])].map(key),
          }
        })
        .sort((a, b) => a.order - b.order)
      listeners.forEach((l) => l())
    })
    // Un échec (hors réseau local ?) : on retentera au prochain « : ».
    .catch(() => {
      loading = null
    })
  return loading
}

/** Pour `useSyncExternalStore` : les données arrivent après le premier « : ». */
export function subscribeEmojis(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const emojisLoaded = () => entries !== null

/**
 * Ce qui répond à une requête : un nom ou un raccourci égal, puis qui
 * commence par elle, puis un mot-clé qui commence par elle, puis un mot du
 * nom ; à rang égal, l'ordre d'Unicode.
 */
export function emojiResults(query: string): Emoji[] {
  const q = key(query)
  if (!entries || q.length < MIN_QUERY) return []
  const rank = ({ names, tags }: Entry) => {
    if (names.includes(q)) return 0
    if (names.some((n) => n.startsWith(q))) return 1
    if (tags.some((t) => t.startsWith(q))) return 2
    if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(q)))) return 3
    return null
  }
  return entries
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter((r): r is { entry: Entry; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map(({ entry: { emoji, label, category } }) => ({
      emoji,
      label,
      category,
    }))
}

/** L'emoji dont un nom ou un raccourci est exactement la requête. */
function exactEmoji(query: string) {
  const q = key(query)
  return entries?.find((e) => e.names.includes(q))?.emoji ?? null
}

/** Le « : » ouvert : sa place, le curseur, ce qu'on a écrit entre les deux. */
export type EmojiQuery = TriggerQuery

export const emojiKey: TriggerKey = new PluginKey('emojiMenu')

/** Fermer le menu (Échap, Tab) : le texte tapé reste. */
export const closeEmoji = (tr: Transaction) => closeTrigger(tr, emojiKey)

/** Le « : » ouvert dans cet état, s'il y en a un. */
export const emojiAt = (state: EditorState) => triggerAt(state, emojiKey)

/** Le plugin qui suit le « : » ouvert (cf. `emojiKey`). */
export const emojiPlugin = () =>
  triggerPlugin({
    key: emojiKey,
    char: ':',
    // Données pas encore là, requête trop courte : rien ne compte pour rien.
    hits: (query) =>
      !entries ||
      key(query).length < MIN_QUERY ||
      emojiResults(query).length > 0,
    // Un second « : » referme la requête.
    accepts: (query) => !query.includes(':'),
    props: {
      // `:feu:` → 🔥 : le « : » qui referme un nom exact pose l'emoji.
      handleTextInput(view, from, to, text) {
        const open = emojiAt(view.state)
        if (text !== ':' || !open || from !== open.to || to !== open.to)
          return false
        const emoji = exactEmoji(open.query)
        if (!emoji) return false
        view.dispatch(view.state.tr.insertText(emoji, open.from, to))
        return true
      },
    },
  })
