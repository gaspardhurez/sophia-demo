import type { Node as PMNode } from '@tiptap/pm/model'
import {
  type EditorState,
  Plugin,
  type PluginKey,
  type PluginSpec,
  type Transaction,
} from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'

/**
 * Un menu ouvert par un caractère tapé dans le texte — le « / » des blocs,
 * le « : » des emojis (relevé Notion §3) : sa règle d'ouverture et sa
 * requête. Chaque menu n'en fournit que le caractère et ce qui répond.
 *
 * Il s'ouvre quand on **tape** le caractère dans un bloc de texte — en début
 * de bloc ou après une espace ; jamais collé à un mot, jamais dans du code.
 * Il reste ouvert tant que le curseur suit la requête ; il se ferme sur le
 * caractère + espace, une double espace, trois caractères de plus sans
 * résultat, ou dès que le curseur quitte la requête — et ne se rouvre qu'au
 * même caractère retapé.
 */

/** Le caractère ouvert : sa place, le curseur, ce qu'on a écrit entre les deux. */
export interface TriggerQuery {
  /** Le caractère. */
  from: number
  /** Le curseur. */
  to: number
  query: string
}

interface TriggerState extends TriggerQuery {
  /** La longueur de requête à laquelle il n'y a plus eu de résultat. */
  missAt: number | null
}

export type TriggerKey = PluginKey<TriggerState | null>

/** Fermer le menu (Échap, Tab) : le texte tapé reste. */
export const closeTrigger = (tr: Transaction, key: TriggerKey) =>
  tr.setMeta(key, 'close')

/** Le caractère ouvert dans cet état, s'il y en a un. */
export function triggerAt(
  state: EditorState,
  key: TriggerKey,
): TriggerQuery | null {
  const open = key.getState(state)
  return open ? { from: open.from, to: open.to, query: open.query } : null
}

/** Après combien de caractères sans résultat le menu se ferme (Notion). */
const MISSES = 3

/** Le texte d'un bloc : un saut de ligne pour `hardBreak`, ￼ pour un atome. */
const leaf = (node: PMNode) =>
  node.type.spec.linebreakReplacement ? '\n' : '￼'

/** Le caractère vient d'être tapé (ou posé par le « + ») juste avant le curseur. */
function typedAt(
  tr: Transaction,
  state: EditorState,
  char: string,
): number | null {
  if (!tr.docChanged) return null
  const ui = tr.getMeta('uiEvent')
  if (ui === 'paste' || ui === 'drop') return null
  const inserted = tr.steps.some(
    (step) =>
      step instanceof ReplaceStep &&
      step.slice.content
        .textBetween(0, step.slice.content.size, undefined, leaf)
        .endsWith(char),
  )
  if (!inserted) return null
  const { selection } = state
  if (!selection.empty) return null
  const { $from } = selection
  const block = $from.parent
  if (!block.isTextblock || block.type.spec.code) return null
  if ($from.marks().some((mark) => mark.type.spec.code)) return null
  const before = block.textBetween(0, $from.parentOffset, undefined, leaf)
  if (!before.endsWith(char)) return null
  // En début de bloc, ou après une espace : jamais collé à un mot.
  if (before.length > 1 && !/\s/.test(before.at(-2) ?? '')) return null
  return $from.pos - 1
}

/** La requête du caractère en `from`, si le curseur la suit encore. */
function queryOf(
  state: EditorState,
  from: number,
  char: string,
): TriggerQuery | null {
  const { selection } = state
  if (!selection.empty) return null
  const { $from } = selection
  if (from < $from.start() || from >= $from.pos) return null
  if (state.doc.textBetween(from, from + 1) !== char) return null
  const query = state.doc.textBetween(from + 1, $from.pos, undefined, leaf)
  // Le caractère + espace, ou une double espace : on ne cherchait rien.
  if (query.startsWith(' ') || query.includes('  ') || query.includes('\n'))
    return null
  return { from, to: $from.pos, query }
}

/**
 * Le plugin qui suit le caractère ouvert. `hits(query)` : la requête a-t-elle
 * un résultat ; `accepts(query)` : la requête est-elle encore une requête
 * (le « : » se ferme sur un second « : ») ; `props` : celles du plugin.
 */
export function triggerPlugin({
  key,
  char,
  hits,
  accepts = () => true,
  props,
}: {
  key: TriggerKey
  char: string
  hits: (query: string) => boolean
  accepts?: (query: string) => boolean
  props?: PluginSpec<TriggerState | null>['props']
}) {
  return new Plugin<TriggerState | null>({
    key,
    props,
    state: {
      init: () => null,
      apply(tr, prev, _old, state) {
        if (tr.getMeta(key) === 'close') return null
        const typed = typedAt(tr, state, char)
        const from = typed ?? (prev ? tr.mapping.map(prev.from, 1) : null)
        if (from === null) return null
        const open = queryOf(state, from, char)
        if (!open || !accepts(open.query)) return null
        const missAt = hits(open.query)
          ? null
          : ((typed === null ? prev?.missAt : null) ?? open.query.length)
        if (missAt !== null && open.query.length >= missAt + MISSES) return null
        return { ...open, missAt }
      },
    },
  })
}
