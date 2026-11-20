import type { LearningOverview } from './types'

/** Le compte de la pastille rouge de « Le hub » (colonne du hub) :
 *  ce qui est à **rattraper** — interros en retard, séances passées non
 *  faites. Les séances du jour n'y comptent plus, et la pastille a quitté la
 *  navigation (26/10) : un compte mêlé n'était pas clair. */
export function urgentCount(overview: LearningOverview | undefined): number {
  if (!overview) return 0
  return overview.groups.find((g) => g.group === 'catch_up')?.items.length ?? 0
}
