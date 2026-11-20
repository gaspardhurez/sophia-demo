import {
  slotRange,
  type Unavailability,
  unavailabilityRange,
} from '@/entities/unavailability'
import { cn } from '@/shared/lib/utils'

import { CELL_H, DAY_START } from '../model/constants'
import {
  edgesIn,
  type UnavailabilityEdge,
} from '../model/unavailability-resize'
import type { DayUnavailability } from '../model/use-unavailability'

/** Le gris plein d'un créneau bloqué : la maquette pose oklch(0.93) sur
 *  blanc, soit l'encre à 9 % sur le fond, opaque. En sombre, il en faut plus
 *  pour se détacher de la grille (la maquette n'a pas de thème sombre). */
const SLOT_BG =
  'bg-[color-mix(in_oklab,var(--color-foreground)_9%,var(--color-background))] dark:bg-[color-mix(in_oklab,var(--color-foreground)_16%,var(--color-background))]'
/** Le voile : l'encre à 3 % (maquette), 6 % en sombre. */
const VEIL_BG = 'bg-foreground/[0.03] dark:bg-foreground/[0.06]'

/**
 * Les indisponibilités d'un jour dans la grille horaire (#105) : le voile
 * clair de la période, les créneaux bloqués en gris plein, leur nom en tête.
 * Sous les activités, qui passent par-dessus, normalement.
 *
 * Le voile ne prend pas le pointeur : c'est la colonne du jour, dessous, qui
 * reconnaît le survol, le clic et le glisser sur une indisponibilité — sans
 * quoi on ne pourrait plus y créer d'activité en glissant. Seuls ses bords se
 * prennent, pour la redimensionner comme une activité.
 */
export function UnavailabilityLayer({
  day,
  items,
  popoverFor,
  onResizeStart,
}: {
  /** Le jour, à minuit. */
  day: Date
  items: DayUnavailability[]
  /** L'indisponibilité dont la carte s'ouvre dans ce jour, survolée. */
  popoverFor: Unavailability | null
  onResizeStart: (
    u: Unavailability,
    edge: UnavailabilityEdge & { hour: number },
    e: React.PointerEvent,
  ) => void
}) {
  return (
    <>
      {items.flatMap(({ unavailability: u, pieces }) =>
        pieces.map((p, i) => (
          <div
            key={`${u.id}-${i}`}
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 z-[1]',
              p.kind === 'slot' ? SLOT_BG : VEIL_BG,
            )}
            style={{
              top: (p.start - DAY_START) * CELL_H,
              height: (p.end - p.start) * CELL_H,
            }}
          >
            {p.label && (
              <span className="absolute top-1 right-1 left-1.5 truncate text-[11px] leading-[14px] font-medium text-foreground/70">
                {p.label}
              </span>
            )}
          </div>
        )),
      )}
      {items.flatMap(({ unavailability: u }) =>
        edgesIn(u, day)
          // Ceux de la période après ceux des créneaux : quand deux bords se
          // confondent, celui de la période garde la main.
          .sort((a, b) => Number(a.slotId === null) - Number(b.slotId === null))
          .map((edge) => (
            <ResizeEdge
              key={`${u.id}-${edge.slotId ?? 'period'}-${edge.edge}`}
              edge={edge}
              onPointerDown={(e) => onResizeStart(u, edge, e)}
            />
          )),
      )}
      {popoverFor && (
        <UnavailabilityCard
          unavailability={popoverFor}
          top={popoverTop(items, popoverFor)}
        />
      )}
    </>
  )
}

/**
 * Un bord qu'on tire. Celui de la période est centré sur sa limite (3 px de
 * part et d'autre), celui d'un créneau bloqué se prend en dedans (8 px, comme
 * une activité) : un créneau qui commence avec la période laisse les deux se
 * prendre. Sous les activités, qui passent par-dessus.
 */
function ResizeEdge({
  edge,
  onPointerDown,
}: {
  edge: UnavailabilityEdge & { hour: number }
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const y = (edge.hour - DAY_START) * CELL_H
  const h = edge.slotId ? 8 : 6
  const top = edge.slotId ? (edge.edge === 'top' ? y : y - h) : y - h / 2
  return (
    <div
      aria-hidden
      onPointerDown={(e) => {
        if (e.button !== 0 || e.shiftKey) return
        e.stopPropagation()
        onPointerDown(e)
      }}
      className="absolute inset-x-0 z-[1] cursor-ns-resize"
      style={{ top, height: h }}
    />
  )
}

/** Sous le nom de la période, là où il s'écrit. */
function popoverTop(items: DayUnavailability[], u: Unavailability): number {
  const pieces = items.find((x) => x.unavailability.id === u.id)?.pieces ?? []
  const anchor = pieces.find((p) => p.kind === 'veil' && p.label) ?? pieces[0]
  return anchor ? (anchor.start - DAY_START) * CELL_H + 24 : 0
}

/** Ce que le survol de la plage montre : nom, période, créneaux bloqués. */
function UnavailabilityCard({
  unavailability: u,
  top,
}: {
  unavailability: Unavailability
  top: number
}) {
  return (
    <div
      style={{ top }}
      className="pointer-events-none absolute left-2 z-[35] flex w-[260px] flex-col gap-2 rounded-[10px] border border-border bg-popover px-3 py-2.5 text-xs shadow-lg"
    >
      <div className="flex items-center gap-1.5">
        {u.emoji && <span className="text-sm">{u.emoji}</span>}
        <span className="truncate text-[13px] font-semibold">{u.title}</span>
      </div>
      <span className="whitespace-nowrap tabular-nums">
        {unavailabilityRange(u)}
      </span>
      {u.slots.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-1.5">
          {u.slots.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              {s.emoji && <span>{s.emoji}</span>}
              <span className="truncate font-medium">{s.title}</span>
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                {slotRange(s)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
