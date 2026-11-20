import type { ActivityTypeLink } from '../model/types'
import { activeDays } from './link'
import { DAY_LABELS } from './weekdays'

/** Un créneau de la semaine type : un jour de la récurrence d'un lien. */
export interface WeekSlot {
  link: ActivityTypeLink
  /** « 18 h 30 », « 9 h » ; vide sans créneau horaire. */
  hour: string
  /** « Tennis · mar. 18 h 30 ». */
  tip: string
}

/** `18:30:00` → « 18 h 30 », `09:00:00` → « 9 h ». */
export function fmtSlotHour(slotStart: string | null): string {
  if (!slotStart) return ''
  const [h, m] = slotStart.split(':')
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`
}

/**
 * La semaine type d'un projet (#85) : pour chaque jour, lundi d'abord, les
 * créneaux de ses liens récurrents — sans heure d'abord, puis par heure. Une
 * Manuelle n'a aucun jour : elle n'y figure pas.
 */
export function weekSlots(links: ActivityTypeLink[]): WeekSlot[][] {
  const key = (l: ActivityTypeLink) => l.slot_start ?? ''
  return DAY_LABELS.map((label, day) => {
    const short = `${label.slice(0, 3).toLowerCase()}.`
    return links
      .filter((l) => activeDays(l.planning, l.weekdays).includes(day))
      .sort((a, b) => key(a).localeCompare(key(b)))
      .map((link) => {
        const hour = fmtSlotHour(link.slot_start)
        const tip = [link.title, hour ? `${short} ${hour}` : short].join(' · ')
        return { link, hour, tip }
      })
  })
}
