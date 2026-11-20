import { addDays, startOfWeek } from '@/shared/lib/date'

/**
 * La préparation est une **charnière entre deux semaines calendaires** (#92,
 * `chantiers/rituel-de-semaine.md`) : elle valide la semaine écoulée (N) et
 * prépare la semaine prochaine (N+1). Rien d'autre ne s'y affiche.
 */
export type PreparationWeek = 'past' | 'next'

/** Une semaine : du lundi (inclus) au lundi suivant (exclu). */
export interface WeekSpan {
  start: Date
  end: Date
}

export interface PreparationWeeks {
  past: WeekSpan
  next: WeekSpan
}

/** Les deux semaines d'une préparation, depuis le lundi de la semaine
 *  préparée (N+1). */
export function preparationWeeks(nextStart: Date): PreparationWeeks {
  const next = startOfWeek(nextStart)
  return {
    past: { start: addDays(next, -7), end: next },
    next: { start: next, end: addDays(next, 7) },
  }
}

/** Le nom d'une semaine dans le mode, tel que l'en-tête du calendrier le dit. */
export const WEEK_NAME: Record<PreparationWeek, string> = {
  past: 'Semaine écoulée',
  next: 'Semaine prochaine',
}

const dayMonth = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/**
 * « 28 sept. → 4 oct. », et « 5 → 11 oct. » quand le mois ne change pas —
 * du premier au dernier jour, `end` étant exclu.
 */
export function fmtDayRange(start: Date, end: Date): string {
  const last = addDays(end, -1)
  const sameMonth =
    start.getMonth() === last.getMonth() &&
    start.getFullYear() === last.getFullYear()
  return sameMonth
    ? `${start.getDate()} → ${dayMonth(last)}`
    : `${dayMonth(start)} → ${dayMonth(last)}`
}

/** Relit le lundi porté par l'URL ; `null` si la date ne se lit pas. */
export function parseWeekParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : startOfWeek(d)
}
