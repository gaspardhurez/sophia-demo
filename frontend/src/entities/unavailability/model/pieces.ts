import { addDays, startOfDay } from '@/shared/lib/date'

import type { Unavailability, UnavailabilitySlot } from './types'

/**
 * Un morceau d'indisponibilité dans la grille d'un jour, en heures décimales
 * (0 → 24) : le **voile** clair de la période, ou un **créneau bloqué** en
 * gris plein.
 */
export interface UnavailabilityPiece {
  kind: 'veil' | 'slot'
  start: number
  end: number
  /** « 🏡 Chez les parents », « 🚆 Train » — en tête du morceau, s'il le
   *  porte. */
  label: string | null
  slot: UnavailabilitySlot | null
}

const named = (x: { emoji: string | null; title: string }) =>
  x.emoji ? `${x.emoji} ${x.title}` : x.title

/** La fin réelle : en journées entières, `end_at` est le dernier jour à
 *  minuit, la période court jusqu'au lendemain. */
export function unavailabilityEnd(u: Unavailability): Date {
  const end = new Date(u.end_at)
  return u.all_day ? addDays(startOfDay(end), 1) : end
}

const hoursIn = (day: Date, t: Date) =>
  Math.min(24, Math.max(0, (t.getTime() - day.getTime()) / 3_600_000))

/**
 * La découpe d'une indisponibilité sur les jours affichés (`days`, à minuit,
 * dans l'ordre) : pour chaque jour, ses morceaux — les créneaux bloqués, et le
 * voile entre eux.
 *
 * Le nom de la période s'écrit en tête du **premier morceau clair visible** :
 * une indisponibilité commencée la semaine d'avant se nomme encore. Celui d'un
 * créneau, en tête de son premier morceau visible.
 */
export function unavailabilityPieces(
  u: Unavailability,
  days: Date[],
): UnavailabilityPiece[][] {
  const from = new Date(u.start_at)
  const to = unavailabilityEnd(u)
  let periodNamed = false
  const slotNamed = new Set<string>()
  return days.map((day) => {
    const next = addDays(day, 1)
    if (to <= day || from >= next) return []
    const a = hoursIn(day, from)
    const b = hoursIn(day, to)
    const slots = u.slots
      .map((s) => ({
        slot: s,
        start: Math.max(a, hoursIn(day, new Date(s.start_at))),
        end: Math.min(b, hoursIn(day, new Date(s.end_at))),
      }))
      .filter((s) => s.end > s.start)
      .sort((x, y) => x.start - y.start)
    const pieces: UnavailabilityPiece[] = []
    let cursor = a
    const veil = (end: number) => {
      if (end <= cursor) return
      pieces.push({
        kind: 'veil',
        start: cursor,
        end,
        label: periodNamed ? null : named(u),
        slot: null,
      })
      periodNamed = true
    }
    for (const s of slots) {
      veil(s.start)
      const first = !slotNamed.has(s.slot.id)
      slotNamed.add(s.slot.id)
      pieces.push({
        kind: 'slot',
        start: s.start,
        end: s.end,
        label: first ? named(s.slot) : null,
        slot: s.slot,
      })
      cursor = Math.max(cursor, s.end)
    }
    veil(b)
    return pieces
  })
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
const fmtTime = (d: Date) =>
  d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** « sam. 3 oct. 09:00 → dim. 4 oct. 20:00 » ; en journées entières, les
 *  jours seuls (« sam. 3 oct. → dim. 4 oct. »). */
export function unavailabilityRange(u: Unavailability): string {
  const from = new Date(u.start_at)
  const to = new Date(u.end_at)
  if (u.all_day)
    return to.getTime() === from.getTime()
      ? fmtDay(from)
      : `${fmtDay(from)} → ${fmtDay(to)}`
  return `${fmtDay(from)} ${fmtTime(from)} → ${fmtDay(to)} ${fmtTime(to)}`
}

/** « sam. 09:00–11:00 » — un créneau bloqué dans une liste. */
export function slotRange(s: UnavailabilitySlot): string {
  const from = new Date(s.start_at)
  const to = new Date(s.end_at)
  const weekday = from.toLocaleDateString('fr-FR', { weekday: 'short' })
  return `${weekday} ${fmtTime(from)}–${fmtTime(to)}`
}
