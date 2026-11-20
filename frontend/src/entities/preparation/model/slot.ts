import { addDays, startOfDay } from '@/shared/lib/date'

/**
 * Le créneau proposé pour préparer la semaine qui commence `weekStart` : le
 * dimanche d'avant, jour du rituel, à 18 h ; ce dimanche passé, aujourd'hui à
 * l'heure qui suit (entre 7 h et 21 h). Une heure. On le déplace ensuite au
 * calendrier comme toute activité.
 */
export function defaultRitualSlot(
  weekStart: Date,
  now: Date,
): { start: Date; end: Date } {
  const sunday = addDays(startOfDay(weekStart), -1)
  const today = startOfDay(now)
  const start = new Date(today < sunday ? sunday : today)
  const hour =
    today < sunday ? 18 : Math.min(21, Math.max(7, now.getHours() + 1))
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(hour + 1)
  return { start, end }
}
