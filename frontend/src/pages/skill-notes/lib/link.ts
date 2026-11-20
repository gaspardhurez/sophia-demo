import type { Editor } from '@tiptap/core'
import { getMarkRange } from '@tiptap/core'

/** Ce qui ressemble à une adresse : un schéma (`https:`, `mailto:`…), ou un
 *  domaine (`exemple.fr/page`). */
const SCHEME = /^[a-z][\w+.-]*:/i
const DOMAIN = /^[^\s/]+\.[a-z]{2,}(?:[/?#]\S*)?$/i

export function looksLikeLink(text: string): boolean {
  const t = text.trim()
  return SCHEME.test(t) || DOMAIN.test(t)
}

/** L'adresse telle qu'on la pose : `https://` devant un domaine nu. */
export function normalizeHref(text: string): string {
  const t = text.trim()
  return SCHEME.test(t) ? t : `https://${t}`
}

/** La portée du lien qui contient ce nœud du DOM (un `<a>` de l'éditeur). */
export function linkRangeAt(
  editor: Editor,
  el: HTMLElement,
): { from: number; to: number; href: string; text: string } | null {
  let pos: number
  try {
    pos = editor.view.posAtDOM(el, 0)
  } catch {
    return null
  }
  const type = editor.schema.marks.link
  const range = getMarkRange(editor.state.doc.resolve(pos), type)
  if (!range) return null
  const mark = editor.state.doc
    .resolve(range.from + 1)
    .marks()
    .find((m) => m.type === type)
  return {
    ...range,
    href: (mark?.attrs.href as string | undefined) ?? '',
    text: editor.state.doc.textBetween(range.from, range.to),
  }
}

/** Les ombres des menus des notes (barre de sélection, « / », « : »). */
export const MENU_SHADOW =
  'shadow-[0_14px_28px_-6px_oklch(0.21_0.008_285/0.2),0_2px_4px_-1px_oklch(0.21_0.008_285/0.12)]'
