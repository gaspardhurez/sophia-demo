import { daysBetween, fmtShortDate, startOfDay } from '@/shared/lib/date'

import type { Activity } from './types'

/**
 * Une interro : une activité qui porte un acte d'interro (#82). Posée par
 * l'app, elle n'est **jamais ratée** (#78, #84) : passé son jour sans
 * passation, elle reste à faire, en retard.
 */
export function isRecall(a: Activity): boolean {
  return a.acts.some((x) => x.kind === 'recall')
}

/**
 * L'interro reste-t-elle à passer ? Son acte n'est pas passé et l'activité
 * n'est pas cochée (cocher à la main vaut passée). Depuis le 20/10/2026,
 * l'acte sait qu'il est passé (`passed_on`) : une séance qui porte aussi
 * autre chose reste à faire après la passation.
 */
export function isPendingRecall(a: Activity): boolean {
  return !a.done && a.acts.some((x) => x.kind === 'recall' && !x.passed_on)
}

/** Le cycle de l'interro que porte l'activité — ce qui mène à sa passation
 *  (`/plans/:id/interro`). */
export function recallPlanOf(a: Activity): string | null {
  return a.acts.find((x) => x.kind === 'recall')?.plan_id ?? null
}

/** L'interro est-elle en retard : non passée, et son jour est révolu ? */
export function isOverdueRecall(
  a: Activity,
  today: Date = new Date(),
): boolean {
  return (
    isPendingRecall(a) &&
    a.start_at !== null &&
    new Date(a.start_at) < startOfDay(today)
  )
}

/** « depuis lun. » : le jour de l'interro en retard, au plus court. Au-delà
 *  d'une semaine, le jour seul serait ambigu : la date courte le remplace. */
export function overdueSince(a: Activity, today: Date = new Date()): string {
  if (!a.start_at) return ''
  const day = new Date(a.start_at)
  return daysBetween(day, today) < 7
    ? `depuis ${day.toLocaleDateString('fr-FR', { weekday: 'short' })}`
    : `depuis le ${fmtShortDate(day)}`
}
