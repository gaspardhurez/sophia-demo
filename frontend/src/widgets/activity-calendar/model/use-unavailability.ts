import { useEffect, useMemo, useState } from 'react'

import {
  type Unavailability,
  type UnavailabilityPiece,
  unavailabilityPieces,
  useUnavailabilities,
  useUpdateUnavailability,
  useUpdateUnavailabilitySlot,
} from '@/entities/unavailability'
import type { Period } from '@/features/unavailability/edit'
import { ApiError } from '@/shared/api'
import { addDays, toLocalISO } from '@/shared/lib/date'
import { panelPosBeside } from '@/shared/lib/panel-position'
import { toast } from '@/shared/ui'

import { CELL_H, snap } from './constants'
import {
  resizeUnavailability,
  type UnavailabilityEdge,
} from './unavailability-resize'

/** Les morceaux d'une indisponibilité dans un jour. */
export interface DayUnavailability {
  unavailability: Unavailability
  pieces: UnavailabilityPiece[]
}

/** Le panneau d'indisponibilité : un brouillon, ou une indisponibilité
 *  ouverte (avec, éventuellement, une plage glissée à nommer en créneau). */
type PanelState =
  | { seq: number; draft: Period; id: null }
  | {
      seq: number
      draft: null
      id: string
      pendingSlot?: { start: Date; end: Date }
    }

/** Le choix au lâcher d'un glisser dans une indisponibilité. */
export interface RangeAskState {
  x: number
  y: number
  unavailability: Unavailability
  day: Date
  startH: number
  endH: number
  rect: DOMRect
}

/** Un bord d'indisponibilité tiré (comme celui d'une activité). */
interface ResizeState extends UnavailabilityEdge {
  unavailability: Unavailability
  day: Date
  dayIdx: number
  /** L'heure du bord au départ, dans `day`. */
  hour: number
  startClientY: number
  /** Le jour, pour ouvrir le panneau si le bord est cliqué sans bouger. */
  rect: DOMRect
}

/** Au-delà, le pointeur a bougé : c'est un redimensionnement, pas un clic. */
const RESIZE_CLICK_SLOP = 3

const at = (day: Date, h: number) => {
  const d = new Date(day)
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return d
}

/**
 * Les indisponibilités de la grille (#105) : la lecture de la fenêtre, leur
 * découpe jour par jour, ce que le pointeur vise, et l'état de leur panneau.
 * Tenu à part du calendrier, déjà long, qui n'en garde que le branchement.
 */
export function useUnavailabilityLayer({
  weekStart,
  dayCount,
  closeActivityPanel,
}: {
  weekStart: Date
  dayCount: number
  closeActivityPanel: () => void
}) {
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i)),
    [weekStart, dayCount],
  )
  const { data } = useUnavailabilities(
    toLocalISO(weekStart),
    toLocalISO(addDays(weekStart, dayCount)),
  )
  // Pendant un redimensionnement, et jusqu'à ce que le serveur l'ait
  // enregistré, l'indisponibilité tirée se lit telle qu'elle sera.
  const [preview, setPreview] = useState<Unavailability | null>(null)
  const list = useMemo(
    () =>
      (data ?? []).map((u) => (preview && u.id === preview.id ? preview : u)),
    [data, preview],
  )

  /** Pour chaque jour affiché, ses indisponibilités et leurs morceaux. */
  const byDay = useMemo<DayUnavailability[][]>(() => {
    const out: DayUnavailability[][] = days.map(() => [])
    for (const u of list)
      unavailabilityPieces(u, days).forEach((pieces, i) => {
        if (pieces.length) out[i].push({ unavailability: u, pieces })
      })
    return out
  }, [list, days])

  /** L'indisponibilité sous le pointeur, à cette heure de ce jour. */
  function hit(dayIdx: number, hour: number): Unavailability | null {
    const found = (byDay[dayIdx] ?? []).find((x) =>
      x.pieces.some((p) => hour >= p.start && hour < p.end),
    )
    return found?.unavailability ?? null
  }

  const [hovered, setHovered] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [ask, setAsk] = useState<RangeAskState | null>(null)

  const nextSeq = () => (panel?.seq ?? 0) + 1

  function openExisting(
    u: Unavailability,
    rect: DOMRect,
    dayIdx: number,
    pendingSlot?: { start: Date; end: Date },
  ) {
    closeActivityPanel()
    setHovered(null)
    setPos(panelPosBeside(rect, dayIdx >= dayCount - 2 ? 'left' : 'right'))
    setPanel({ seq: nextSeq(), draft: null, id: u.id, pendingSlot })
  }

  /** Le bouton « Indisponible » : un brouillon, aujourd'hui de 12:00 à 13:00
   *  comme la maquette — le premier jour affiché si aujourd'hui n'y est pas. */
  function openDraft(button: DOMRect) {
    closeActivityPanel()
    const today = new Date()
    const shown = days.find((d) => d.toDateString() === today.toDateString())
    const day = shown ?? days[0]
    setPos({
      top: button.bottom + 8,
      left: Math.max(8, button.right - 320),
    })
    setPanel({
      seq: nextSeq(),
      id: null,
      draft: { allDay: false, start: at(day, 12), end: at(day, 13) },
    })
  }

  /** Un brouillon aux dates d'un brouillon d'activité, là où était son
   *  panneau : l'option « Indisponibilité » du choix du domaine. */
  function openDraftAt(draft: Period, at: { top: number; left: number }) {
    closeActivityPanel()
    setPos(at)
    setPanel({ seq: nextSeq(), id: null, draft })
  }

  const close = () => setPanel(null)

  const update = useUpdateUnavailability()
  const updateSlot = useUpdateUnavailabilitySlot()
  const [resize, setResize] = useState<ResizeState | null>(null)

  /**
   * Tirer le bord haut ou bas d'une période ou d'un créneau bloqué le
   * déplace, comme celui d'une activité : aperçu direct, écriture au
   * relâcher. Cliqué sans bouger, il ouvre le panneau, comme le reste de la
   * plage.
   */
  useEffect(() => {
    if (!resize) return
    const r = resize
    let moved = false
    let next: Unavailability = r.unavailability
    function onMove(e: PointerEvent) {
      if (Math.abs(e.clientY - r.startClientY) > RESIZE_CLICK_SLOP) moved = true
      if (!moved) return
      const hour = snap(r.hour + (e.clientY - r.startClientY) / CELL_H)
      next = resizeUnavailability(r.unavailability, r, r.day, hour)
      setPreview(next)
    }
    async function onUp() {
      setResize(null)
      if (!moved) {
        openExisting(r.unavailability, r.rect, r.dayIdx)
        return
      }
      const key = r.edge === 'top' ? 'start_at' : 'end_at'
      const before = r.slotId
        ? r.unavailability.slots.find((s) => s.id === r.slotId)
        : r.unavailability
      const after = r.slotId ? next.slots.find((s) => s.id === r.slotId) : next
      const same =
        before &&
        after &&
        new Date(before[key]).getTime() === new Date(after[key]).getTime()
      if (!before || !after || same) {
        setPreview(null)
        return
      }
      const body = { [key]: toLocalISO(new Date(after[key])) }
      try {
        if (r.slotId)
          await updateSlot.mutateAsync({
            id: r.unavailability.id,
            slotId: r.slotId,
            body,
          })
        else await update.mutateAsync({ id: r.unavailability.id, body })
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Resize échoué')
      } finally {
        setPreview(null)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize])

  function startResize(
    u: Unavailability,
    edge: UnavailabilityEdge & { hour: number },
    dayIdx: number,
    e: React.PointerEvent,
  ) {
    const col = (e.currentTarget as HTMLElement)
      .closest('[data-daycol]')
      ?.getBoundingClientRect()
    setHovered(null)
    setResize({
      ...edge,
      unavailability: u,
      day: days[dayIdx],
      dayIdx,
      startClientY: e.clientY,
      rect: {
        top: e.clientY,
        left: col?.left ?? e.clientX,
        right: col?.right ?? e.clientX,
      } as DOMRect,
    })
  }

  // Ferme le panneau au clic en dehors (hors panneau, sélecteur radix, menu).
  useEffect(() => {
    if (!panel) return
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-ui]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"]')
      )
        return
      setPanel(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [panel])

  const current =
    panel?.id != null ? (list.find((u) => u.id === panel.id) ?? null) : null

  const hoveredU = hovered ? (list.find((u) => u.id === hovered) ?? null) : null

  return {
    byDay,
    hit,
    hovered: hoveredU,
    /** Le jour où s'ouvre la carte du survol — aucune pendant qu'un panneau
     *  est ouvert. */
    popoverDay:
      hoveredU && !panel && !resize ? popoverDay(byDay, hoveredU.id) : -1,
    setHovered,
    panel,
    current,
    pos,
    openExisting,
    openDraft,
    openDraftAt,
    startResize,
    /** Né du brouillon : le même panneau continue sur elle. */
    adopt: (u: Unavailability) =>
      setPanel((p) => (p ? { seq: p.seq, draft: null, id: u.id } : p)),
    close,
    ask,
    setAsk,
    slotRange: (a: RangeAskState) => ({
      start: at(a.day, a.startH),
      end: at(a.day, a.endH),
    }),
  }
}

/** La carte s'ouvre dans le jour qui porte le nom de la période (sinon le
 *  premier où elle paraît). */
function popoverDay(byDay: DayUnavailability[][], id: string): number {
  const shown = byDay
    .map((items, day) => ({
      day,
      pieces: items.find((x) => x.unavailability.id === id)?.pieces ?? [],
    }))
    .filter((x) => x.pieces.length > 0)
  return (
    shown.find((x) => x.pieces.some((p) => p.kind === 'veil' && p.label))
      ?.day ??
    shown[0]?.day ??
    -1
  )
}
