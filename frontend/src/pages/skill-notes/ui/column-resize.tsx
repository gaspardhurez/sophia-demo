import type { Editor } from '@tiptap/core'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'

import {
  COLUMNS,
  commitWidths,
  previewWidths,
  resizeWidths,
  widthsOf,
} from '../lib/columns'

/** Un écart entre deux colonnes, en coordonnées de `area`. */
interface Gap {
  /** La position du bloc `columns`, et la colonne à gauche de l'écart. */
  pos: number
  i: number
  left: number
  top: number
  width: number
  height: number
}

const key = (g: Gap) => `${g.pos}:${g.i}`

/**
 * Les poignées de redimensionnement entre colonnes (relevé de Notion) : tout
 * l'écart de 46 px se saisit (`col-resize`), un trait de 4 px gris léger y
 * apparaît au survol. Le glisser redimensionne en direct les deux colonnes
 * voisines (aperçu en décorations, cf. `previewWidths`), chacune gardant au
 * moins 15 % ; le lâcher écrit leurs parts dans le document
 * (`commitWidths`), en un seul pas d'annulation.
 *
 * `area` : l'élément qui contient l'éditeur, repère des positions.
 */
export function ColumnResize({
  editor,
  area,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
}) {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [active, setActive] = useState<string | null>(null)
  const measureRef = useRef<() => void>(() => {})

  useEffect(() => {
    const root = area.current
    if (!root) return
    let frame = 0

    const measure = () => {
      frame = 0
      const view = editor.view
      const at = root.getBoundingClientRect()
      const next: Gap[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== COLUMNS) return !node.isTextblock
        const dom = view.nodeDOM(pos)
        if (!(dom instanceof HTMLElement)) return false
        const box = dom.getBoundingClientRect()
        const cols: DOMRect[] = []
        node.forEach((_, offset) => {
          const col = view.nodeDOM(pos + 1 + offset)
          if (col instanceof HTMLElement) cols.push(col.getBoundingClientRect())
        })
        for (let i = 0; i + 1 < cols.length; i++)
          next.push({
            pos,
            i,
            left: cols[i].right - at.left,
            top: box.top - at.top,
            width: cols[i + 1].left - cols[i].right,
            height: box.height,
          })
        return false
      })
      setGaps((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measureRef.current = measure

    schedule()
    editor.on('update', schedule)
    root.addEventListener('mousemove', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      editor.off('update', schedule)
      root.removeEventListener('mousemove', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [editor, area])

  const begin = (e: React.MouseEvent, gap: Gap) => {
    if (e.button !== 0) return
    e.preventDefault()
    const view = editor.view
    const doc = editor.state.doc
    // L'écart survolé a pu disparaître depuis (le document a changé).
    const node = gap.pos < doc.content.size ? doc.nodeAt(gap.pos) : null
    if (node?.type.name !== COLUMNS) return
    const start = widthsOf(node)
    // La largeur que se partagent les colonnes (hors écarts).
    let total = 0
    node.forEach((_, offset) => {
      const col = view.nodeDOM(gap.pos + 1 + offset)
      if (col instanceof HTMLElement) total += col.getBoundingClientRect().width
    })
    if (!total) return
    const x0 = e.clientX
    let widths = start
    setActive(key(gap))
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const move = (ev: MouseEvent) => {
      widths = resizeWidths(start, gap.i, (ev.clientX - x0) / total)
      previewWidths(view, gap.pos, widths)
      measureRef.current()
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
      setActive(null)
      if (editor.isDestroyed) return
      if (widths === start) previewWidths(view, gap.pos, null)
      else commitWidths(view, gap.pos, widths)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (!editor.isEditable) return null
  return gaps.map((gap) => (
    <div
      key={key(gap)}
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner les colonnes"
      onMouseDown={(e) => begin(e, gap)}
      className="group absolute z-10 cursor-col-resize max-[700px]:hidden"
      style={{
        left: gap.left,
        top: gap.top,
        width: gap.width,
        height: gap.height,
      }}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-foreground/10 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100',
          active === key(gap) && 'opacity-100',
        )}
      />
    </div>
  ))
}
