import { useDroppable } from '@dnd-kit/core'
import { useState } from 'react'

import {
  CELL_H,
  clamp,
  DAY_END,
  DAY_START,
  HOURS,
  snap,
  SNAP,
} from '../model/constants'
import { fmtHour } from '@/shared/lib/date'

/** Colonne d'un jour : fond droppable + création par double-clic ou
 * cliquer-glisser d'une plage (aperçu), + clic droit sur zone vide. Maj +
 * glisser tire le lasso de la sélection à la place (`onLassoStart`). */
export function DayColumn({
  day,
  dayDate,
  onCreate,
  onDragCreate,
  onEmptyContext,
  hintAt,
  onTap,
  onHoverHour,
  onLassoStart,
  children,
}: {
  day: number
  dayDate: Date
  onCreate: (day: Date, hour: number, rect: DOMRect) => void
  onDragCreate: (day: Date, startH: number, endH: number, rect: DOMRect) => void
  onEmptyContext: (day: Date, hour: number, e: React.MouseEvent) => void
  /** L'infobulle d'une plage prise à cette heure (les autres projets). Ces
   *  plages laissent passer le pointeur vers le fond, qui porte donc leur
   *  `title` à leur place. */
  hintAt?: (hour: number) => string | undefined
  /** Un clic simple sur le fond, à cette heure (non arrondie) : ouvrir
   *  l'indisponibilité qui s'y trouve (#105). */
  onTap?: (day: Date, hour: number, rect: DOMRect) => void
  /** L'heure sous le pointeur, `null` en sortant du fond : le survol d'une
   *  indisponibilité, dont le voile laisse passer le pointeur. */
  onHoverHour?: (hour: number | null) => void
  /** Maj + glisser : le lasso, tenu par le calendrier (il couvre plusieurs
   *  jours). Absent : Maj + glisser crée comme sans Maj. */
  onLassoStart?: (e: React.PointerEvent) => void
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: String(day) })
  // Sélection d'une plage horaire par cliquer-glisser sur le fond vide.
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const hourAt = (e: React.MouseEvent, el: HTMLElement, max: number) => {
    const rect = el.getBoundingClientRect()
    const y = e.clientY - rect.top
    return clamp(snap(DAY_START + y / CELL_H), DAY_START, max)
  }
  return (
    <div
      ref={setNodeRef}
      data-daycol={day}
      className="relative border-r border-border"
      style={{ height: HOURS.length * CELL_H }}
    >
      <div
        className="absolute inset-0"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          if (e.shiftKey && onLassoStart) {
            onLassoStart(e)
            return
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          const h = hourAt(e, e.currentTarget, DAY_END - SNAP)
          setSel({ a: h, b: h })
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const hour = DAY_START + (e.clientY - rect.top) / CELL_H
          if (hintAt) e.currentTarget.title = sel ? '' : (hintAt(hour) ?? '')
          onHoverHour?.(sel ? null : hour)
          if (!sel) return
          const h = hourAt(e, e.currentTarget, DAY_END)
          setSel((s) => (s ? { ...s, b: h } : s))
        }}
        onPointerUp={(e) => {
          const el = e.currentTarget
          try {
            el.releasePointerCapture(e.pointerId)
          } catch {
            // capture déjà relâchée
          }
          if (!sel) return
          const lo = Math.min(sel.a, sel.b)
          const hi = Math.max(sel.a, sel.b)
          setSel(null)
          if (hi - lo < SNAP && onTap) {
            const rect = el.getBoundingClientRect()
            onTap(dayDate, DAY_START + (e.clientY - rect.top) / CELL_H, {
              top: e.clientY,
              left: rect.left,
              right: rect.right,
            } as DOMRect)
          }
          if (hi - lo >= SNAP) {
            const rect = el.getBoundingClientRect()
            onDragCreate(dayDate, lo, hi, {
              top: e.clientY,
              left: rect.left,
              right: rect.right,
            } as DOMRect)
          }
        }}
        onPointerLeave={() => onHoverHour?.(null)}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const hour = hourAt(e, e.currentTarget, DAY_END - SNAP)
          onCreate(dayDate, hour, {
            ...rect,
            top: e.clientY,
            left: rect.left,
            right: rect.right,
          } as DOMRect)
        }}
        onContextMenu={(e) =>
          onEmptyContext(dayDate, hourAt(e, e.currentTarget, DAY_END - SNAP), e)
        }
      >
        {HOURS.map((h) => (
          <div
            key={h}
            style={{ height: CELL_H }}
            className="border-b border-border/60"
          />
        ))}
      </div>
      {sel && Math.abs(sel.b - sel.a) >= SNAP && (
        <div
          className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-md border-2 border-primary/50 bg-primary/5 px-2 py-1 text-xs font-medium text-primary"
          style={{
            top: (Math.min(sel.a, sel.b) - DAY_START) * CELL_H + 1,
            height: Math.abs(sel.b - sel.a) * CELL_H - 2,
          }}
        >
          {fmtHour(Math.min(sel.a, sel.b))}–{fmtHour(Math.max(sel.a, sel.b))}
        </div>
      )}
      {children}
    </div>
  )
}
