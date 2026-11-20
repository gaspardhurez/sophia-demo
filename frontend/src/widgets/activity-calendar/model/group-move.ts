import { addDays, hourOf, toLocalISO } from '@/shared/lib/date'

import { DAY_END, DAY_START, SNAP } from './constants'

/** Ce qu'un décalage de groupe lit d'une activité. */
export type Slot = {
  all_day: boolean
  start_at: string | null
  end_at: string | null
}

/** Début et fin (heures décimales) d'une activité à heure, `null` sinon. */
function hoursOf(s: Slot): { start: number; end: number } | null {
  if (s.all_day || !s.start_at) return null
  const start = new Date(s.start_at)
  const h = hourOf(start)
  const dur = s.end_at
    ? (new Date(s.end_at).getTime() - start.getTime()) / 3_600_000
    : 1
  return { start: h, end: h + dur }
}

/**
 * Le décalage horaire (en heures) qu'un groupe peut prendre : le voulu, borné
 * pour qu'**aucune** activité à heure ne sorte de sa journée. Le groupe
 * s'arrête au bord d'un bloc, comme un bloc seul s'arrête au bord de la
 * grille — recaler chaque activité à part casserait les écarts entre elles.
 * Les journées entières n'ont pas d'heure : elles ne bornent rien.
 */
export function clampHourShift(wanted: number, members: Slot[]): number {
  let lo = -Infinity
  let hi = Infinity
  for (const m of members) {
    const h = hoursOf(m)
    if (!h) continue
    lo = Math.max(lo, DAY_START - h.start)
    hi = Math.min(hi, DAY_END - h.end)
  }
  if (lo > hi) return 0
  return Math.min(Math.max(wanted, lo), hi)
}

/**
 * Les bornes d'une activité décalée de `days` jours et `minutes` minutes — la
 * règle du serveur (`domain/activity.py::shifted`) : une journée entière
 * ignore les minutes. Pour l'aperçu, le cache optimiste et les copies.
 */
export function shiftSlot(
  s: Slot,
  days: number,
  minutes: number,
): { start_at: string | null; end_at: string | null } {
  const move = (iso: string | null) => {
    if (!iso) return null
    const d = addDays(new Date(iso), days)
    if (!s.all_day) d.setMinutes(d.getMinutes() + minutes)
    return toLocalISO(d)
  }
  return { start_at: move(s.start_at), end_at: move(s.end_at) }
}

/** Une séance à heure qu'on redimensionne : début et durée, en heures. */
export type HourSpan = { startH: number; dur: number }

/**
 * L'écart (en heures) qu'un **redimensionnement de groupe** peut prendre : le
 * voulu, borné pour qu'**aucune** séance ne casse — par le bas, aucune ne
 * descend sous un quart d'heure ni ne dépasse 24 h ; par le haut, aucun début
 * ne passe avant l'ouverture du jour ni à moins d'un quart d'heure de sa fin.
 * Le même écart pour toutes : elles gardent leurs écarts entre elles, comme un
 * groupe glissé.
 */
export function clampResize(
  wanted: number,
  edge: 'top' | 'bottom',
  members: HourSpan[],
): number {
  let lo = -Infinity
  let hi = Infinity
  for (const m of members) {
    if (edge === 'bottom') {
      lo = Math.max(lo, SNAP - m.dur)
      hi = Math.min(hi, 24 - m.dur)
    } else {
      lo = Math.max(lo, DAY_START - m.startH)
      hi = Math.min(hi, m.dur - SNAP)
    }
  }
  if (lo > hi) return 0
  return Math.min(Math.max(wanted, lo), hi)
}

/** La séance une fois son bord tiré de `delta` heures. */
export function resized(
  m: HourSpan,
  edge: 'top' | 'bottom',
  delta: number,
): HourSpan {
  return edge === 'bottom'
    ? { startH: m.startH, dur: m.dur + delta }
    : { startH: m.startH + delta, dur: m.dur - delta }
}
