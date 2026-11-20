import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Le texte **provisoire** d'une dictée en direct, montré en gris à
 * l'endroit où elle se posera (#173).
 *
 * Une **décoration** (un widget entre deux blocs), pas un nœud : rien
 * n'entre dans le document tant que le nettoyage n'a pas rendu ses puces —
 * ni l'enregistrement automatique, ni l'historique (⌘Z), ni la
 * vérification ne voient ce gris. Sa place suit ce qui s'écrit autour
 * (`mapping`), et c'est elle qui dit où poser les puces ensuite.
 *
 * Le plugin s'installe le temps d'une dictée (`showDraft`) et s'en va avec
 * elle (`clearDraft`) : les éditeurs qui ne dictent pas n'en portent rien.
 */
interface Draft {
  pos: number
  /** Ce que la transcription a validé : il ne bougera plus. */
  committed: string
  /** Ce qui suit, encore susceptible d'être réécrit par la passe suivante. */
  tentative: string
  /** La voix est arrêtée : le texte part au nettoyage. */
  cleaning: boolean
}

const draftKey = new PluginKey<Draft | null>('dictationDraft')

function widget(draft: Draft): HTMLElement {
  const box = document.createElement('div')
  box.contentEditable = 'false'
  box.dataset.dictationDraft = ''
  box.setAttribute('aria-live', 'polite')
  box.className = draft.cleaning ? 'animate-pulse' : ''
  const p = document.createElement('p')
  const committed = document.createElement('span')
  committed.className = 'text-foreground/45'
  committed.textContent = draft.committed
  const tentative = document.createElement('span')
  tentative.className = 'text-foreground/30'
  // Rien entendu encore : des points de suspension, pour qu'on voie où ça
  // s'écrira.
  tentative.textContent =
    (draft.committed && draft.tentative ? ' ' : '') +
    (draft.tentative || (draft.committed ? '' : '…'))
  p.append(committed, tentative)
  box.append(p)
  return box
}

function draftPlugin(pos: number) {
  return new Plugin<Draft | null>({
    key: draftKey,
    state: {
      init: () => ({ pos, committed: '', tentative: '', cleaning: false }),
      apply(tr, draft) {
        const meta = tr.getMeta(draftKey) as Partial<Draft> | undefined
        if (!draft) return null
        const next = meta ? { ...draft, ...meta } : draft
        return tr.docChanged
          ? { ...next, pos: tr.mapping.map(next.pos, -1) }
          : next
      },
    },
    props: {
      decorations(state) {
        const draft = draftKey.getState(state)
        if (!draft) return null
        return DecorationSet.create(state.doc, [
          Decoration.widget(draft.pos, () => widget(draft), {
            side: -1,
            ignoreSelection: true,
            // Le même texte, le même nœud : pas de clignotement entre deux
            // transactions qui ne le changent pas.
            key: `${draft.cleaning}|${draft.committed}|${draft.tentative}`,
          }),
        ])
      },
    },
  })
}

/** Montre le provisoire d'une dictée à `pos` (une position entre deux
 *  blocs, cf. `dictationSpot`), vide pour commencer. */
export function showDraft(editor: Editor, pos: number) {
  clearDraft(editor)
  editor.registerPlugin(draftPlugin(pos))
}

/** Met à jour le texte provisoire (ou son état : nettoyage en cours). */
export function updateDraft(
  editor: Editor,
  patch: Partial<Omit<Draft, 'pos'>>,
) {
  if (editor.isDestroyed || !draftKey.getState(editor.state)) return
  editor.view.dispatch(
    editor.state.tr.setMeta(draftKey, patch).setMeta('addToHistory', false),
  )
}

/** La place du provisoire, suivie à travers ce qui s'est écrit ; `null`
 *  s'il n'y en a pas. */
export function draftPos(editor: Editor): number | null {
  if (editor.isDestroyed) return null
  return draftKey.getState(editor.state)?.pos ?? null
}

/** Retire le provisoire (les puces le remplacent, ou la dictée s'arrête). */
export function clearDraft(editor: Editor) {
  if (editor.isDestroyed || !draftKey.getState(editor.state)) return
  editor.unregisterPlugin(draftKey)
}
