import {
  type Unavailability,
  unavailabilityEnd,
} from '@/entities/unavailability'
import { addDays } from '@/shared/lib/date'

import { at, SNAP } from './constants'

/** Le bord qu'on tire : celui de la période (`slotId` nul) ou d'un créneau
 *  bloqué, en haut (le début) ou en bas (la fin). */
export interface UnavailabilityEdge {
  slotId: string | null
  edge: 'top' | 'bottom'
}

const MIN_MS = SNAP * 3_600_000
const hoursIn = (day: Date, t: Date) =>
  (t.getTime() - day.getTime()) / 3_600_000

/**
 * Les bords qu'un jour (`day`, à minuit) laisse tirer : ceux qui y tombent.
 * Une période en journées entières n'a pas d'heures à tirer — ses créneaux,
 * si. Chacun avec sa hauteur dans le jour (heures décimales).
 */
export function edgesIn(
  u: Unavailability,
  day: Date,
): (UnavailabilityEdge & { hour: number })[] {
  const next = addDays(day, 1)
  const out: (UnavailabilityEdge & { hour: number })[] = []
  const add = (slotId: string | null, from: Date, to: Date) => {
    if (from >= day && from < next)
      out.push({ slotId, edge: 'top', hour: hoursIn(day, from) })
    if (to > day && to <= next)
      out.push({ slotId, edge: 'bottom', hour: hoursIn(day, to) })
  }
  if (!u.all_day) add(null, new Date(u.start_at), new Date(u.end_at))
  for (const s of u.slots) add(s.id, new Date(s.start_at), new Date(s.end_at))
  return out
}

/**
 * Le bord tiré à l'heure voulue (`hour`, accrochée au quart d'heure) dans le
 * jour où on le tient, borné : un quart d'heure au moins entre début et fin,
 * le jour qu'on ne quitte pas, et un créneau qui tient dans sa période — la
 * période ne passe pas un créneau, le créneau ne sort pas de la période (le
 * serveur le refuserait, 422). Rend l'indisponibilité telle qu'elle serait.
 */
export function resizeUnavailability(
  u: Unavailability,
  { slotId, edge }: UnavailabilityEdge,
  day: Date,
  hour: number,
): Unavailability {
  const from = new Date(u.start_at)
  const to = unavailabilityEnd(u)
  const slot = slotId ? u.slots.find((s) => s.id === slotId) : null
  const ownStart = slot ? new Date(slot.start_at) : from
  const ownEnd = slot ? new Date(slot.end_at) : to
  const ms = (d: Date) => d.getTime()

  let lo = ms(day)
  let hi = ms(addDays(day, 1))
  if (edge === 'top') {
    hi = Math.min(hi, ms(ownEnd) - MIN_MS)
    if (slot) lo = Math.max(lo, ms(from))
    else for (const s of u.slots) hi = Math.min(hi, ms(new Date(s.start_at)))
  } else {
    lo = Math.max(lo, ms(ownStart) + MIN_MS)
    if (slot) hi = Math.min(hi, ms(to))
    else for (const s of u.slots) lo = Math.max(lo, ms(new Date(s.end_at)))
  }
  const t = new Date(Math.min(hi, Math.max(lo, ms(at(day, hour)))))
  const iso = t.toISOString()
  const key = edge === 'top' ? 'start_at' : 'end_at'
  if (!slot) return { ...u, [key]: iso }
  return {
    ...u,
    slots: u.slots.map((s) => (s.id === slotId ? { ...s, [key]: iso } : s)),
  }
}
