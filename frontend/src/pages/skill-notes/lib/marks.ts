import { type Editor, Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style'

import './marks.css'

/**
 * La mise en forme en ligne des notes (relevé Notion §1.7) : gras, italique,
 * souligné, barré, code et lien viennent de StarterKit ; ce fichier ajoute la
 * **couleur** — du texte et du fond —, ⌘⇧H, et le style des marques
 * (`marks.css`).
 *
 * Une couleur est rangée dans le document comme une variable CSS
 * (`var(--note-text-red)`, `var(--note-bg-red)`) : la palette (`marks.css`)
 * se relit en clair comme en sombre, sans toucher au document.
 */

/** Les 10 couleurs de Notion, dans son ordre. `default` retire la couleur. */
export const NOTE_COLORS = [
  { id: 'default', label: 'Par défaut' },
  { id: 'gray', label: 'Gris' },
  { id: 'brown', label: 'Marron' },
  { id: 'orange', label: 'Orange' },
  { id: 'yellow', label: 'Jaune' },
  { id: 'green', label: 'Vert' },
  { id: 'blue', label: 'Bleu' },
  { id: 'purple', label: 'Violet' },
  { id: 'pink', label: 'Rose' },
  { id: 'red', label: 'Rouge' },
] as const
export type NoteColor = (typeof NOTE_COLORS)[number]['id']

/** Couleur du texte, ou du fond (le surlignage). */
export type ColorKind = 'text' | 'background'

/** Le libellé d'une couleur : « Rouge », « Fond rouge ». */
export function colorLabel(kind: ColorKind, color: NoteColor) {
  const label = NOTE_COLORS.find((c) => c.id === color)?.label ?? color
  return kind === 'text' ? label : `Fond ${label.toLowerCase()}`
}

/** La valeur CSS d'une couleur (null pour « Par défaut »). */
export function colorValue(kind: ColorKind, color: NoteColor) {
  if (color === 'default') return null
  return `var(--note-${kind === 'text' ? 'text' : 'bg'}-${color})`
}

const ATTR: Record<ColorKind, 'color' | 'backgroundColor'> = {
  text: 'color',
  background: 'backgroundColor',
}

/** La couleur de la sélection (celle de son début), `default` sinon. */
export function currentColor(editor: Editor, kind: ColorKind): NoteColor {
  const value = editor.getAttributes('textStyle')[ATTR[kind]] as unknown
  return (
    NOTE_COLORS.find((c) => colorValue(kind, c.id) === value)?.id ?? 'default'
  )
}

/**
 * Colore la sélection — ou `ranges`, chacune tour à tour, la dernière restant
 * la sélection (le menu de bloc y passe le texte de chaque bloc). « Par défaut » retire la couleur. La
 * couleur rejoint « Utilisé dernièrement ».
 */
export function applyColor(
  editor: Editor,
  kind: ColorKind,
  color: NoteColor,
  ranges?: { from: number; to: number }[],
) {
  const chain = editor.chain().focus()
  const value = colorValue(kind, color)
  for (const range of ranges ?? [null]) {
    if (range) chain.setTextSelection(range)
    if (kind === 'text') {
      if (value) chain.setColor(value)
      else chain.unsetColor()
    } else if (value) chain.setBackgroundColor(value)
    else chain.unsetBackgroundColor()
  }
  chain.run()
  remember(kind, color)
}

/* « Utilisé dernièrement » : une mémoire locale (ce navigateur). */

export interface RecentColor {
  kind: ColorKind
  color: NoteColor
}

const RECENT_KEY = 'sophia.notes.recent-colors'
const RECENT_MAX = 3

/** Les dernières couleurs posées, la plus récente en tête. */
export function recentColors(): RecentColor[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (r): r is RecentColor =>
        (r?.kind === 'text' || r?.kind === 'background') &&
        NOTE_COLORS.some((c) => c.id === r?.color),
    )
  } catch {
    return []
  }
}

function remember(kind: ColorKind, color: NoteColor) {
  if (color === 'default') return
  const next = [
    { kind, color },
    ...recentColors().filter((r) => r.kind !== kind || r.color !== color),
  ].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Stockage indisponible (navigation privée) : on oublie, simplement.
  }
}

/** Le dernier fond posé — jaune tant qu'aucun ne l'a été (Notion). */
export function lastBackground(): NoteColor {
  return recentColors().find((r) => r.kind === 'background')?.color ?? 'yellow'
}

/**
 * ⌘⇧H : le dernier fond utilisé sur la sélection ; une seconde fois, il
 * s'enlève. La classe `notes-marks` porte la palette et le style des
 * marques (`marks.css`).
 */
const colorShortcuts = Extension.create({
  name: 'noteColorShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': ({ editor }) => {
        if (editor.state.selection.empty) return false
        const color = lastBackground()
        applyColor(
          editor,
          'background',
          currentColor(editor, 'background') === color ? 'default' : color,
        )
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { attributes: { class: 'notes-marks' } } })]
  },
})

/** Les extensions de la couleur, à ajouter à celles de l'éditeur. */
export const noteMarks = [TextStyle, Color, BackgroundColor, colorShortcuts]
