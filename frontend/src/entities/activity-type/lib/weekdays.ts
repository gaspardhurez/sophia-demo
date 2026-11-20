/**
 * Noms complets, 0 = lundi. Les abréviations (« Lu · Me · Ve ») demandaient un
 * décodage à chaque lecture pour un gain de place qu'on n'avait nulle part —
 * ni dans le résumé d'une carte, ni dans le sélecteur du formulaire.
 */
export const DAY_LABELS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
]

/** « Tous les jours » / « Lundi · Mercredi · Vendredi ». */
export function daysSummary(weekdays: number[]): string {
  if (weekdays.length === 7) return 'Tous les jours'
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(' · ')
}

/** « Tous les jours » / « Lundi · Mercredi » / « Manuelle ». */
export function planningSummary(
  planning: 'daily' | 'weekly' | 'manual',
  weekdays: number[],
): string {
  if (planning === 'daily') return 'Tous les jours'
  if (planning === 'manual') return 'Manuelle'
  return daysSummary(weekdays)
}
