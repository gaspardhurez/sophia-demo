import type { Planning } from '../model/types'

/** « Quotidienne » · « Hebdomadaire » · « Manuelle ». */
export const PLANNING_LABELS: Record<Planning, string> = {
  daily: 'Quotidienne',
  weekly: 'Hebdomadaire',
  manual: 'Manuelle',
}

/** L M M J V S D — 0 = lundi. */
export const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Les jours où un lien pose : tous en Quotidienne, aucun en Manuelle. */
export function activeDays(planning: Planning, weekdays: number[]): number[] {
  if (planning === 'daily') return [0, 1, 2, 3, 4, 5, 6]
  if (planning === 'manual') return []
  return weekdays
}
