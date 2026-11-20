import type { Editor } from '@tiptap/core'
import type { RefObject } from 'react'

import { useMarquee } from '../model/use-marquee'

/**
 * Le rectangle de sélection (`useMarquee`) : un aplat de l'accent à 14 %,
 * sans bord ni rayon (Notion : son bleu à 14 %).
 *
 * `area` : l'élément qui contient l'éditeur, repère des positions.
 */
export function Marquee({
  editor,
  area,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
}) {
  const rect = useMarquee(editor, area)
  if (!rect) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 bg-(--note-accent)/14"
      style={rect}
    />
  )
}
