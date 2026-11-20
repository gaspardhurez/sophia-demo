const pad = (n: number) => String(n).padStart(2, '0')

/** « 09:00 » — la valeur d'un `<input type="time">`. */
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Le jour de `day` à l'heure `time` (« 09:00 »). */
export function at(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/** Le jour `iso` (« 2026-10-03 ») à l'heure de `time`. */
export function onDay(iso: string, time: Date): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(time)
  next.setFullYear(y, m - 1, d)
  return next
}

/** Une période telle que le panneau l'édite. */
export interface Period {
  allDay: boolean
  start: Date
  end: Date
}

/**
 * Basculer « Journées entières ». Allumé : les jours seuls, à minuit (la fin
 * est le dernier jour). Éteint : 09:00 le premier jour → 18:00 le dernier.
 */
export function toggleWholeDays(p: Period): Period {
  if (p.allDay)
    return {
      allDay: false,
      start: at(p.start, '09:00'),
      end: at(p.end, '18:00'),
    }
  return { allDay: true, start: at(p.start, '00:00'), end: at(p.end, '00:00') }
}
