import { CHIP_TONES } from '@/shared/ui'

import type { ProjectStatus } from './types'

/** Les statuts de projet dans l'ordre — source unique pour badge et bascule. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'todo',
  'in_progress',
  'achieved',
  'failed',
  'abandoned',
]

/** Libellé et style de badge par statut. */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; badgeClassName: string }
> = {
  todo: {
    label: 'À faire',
    badgeClassName: CHIP_TONES.neutral,
  },
  in_progress: {
    // `sky` et pas l'`amber` des compétences : sur les surfaces de projet, la
    // pastille de rythme est juste à côté, et l'ambre y veut dire « léger
    // retard ». Un état neutre peint en couleur d'alerte se lit comme une
    // alerte.
    label: 'En cours',
    badgeClassName: CHIP_TONES.sky,
  },
  achieved: {
    label: 'Réussi',
    badgeClassName: CHIP_TONES.emerald,
  },
  failed: {
    label: 'Raté',
    badgeClassName: CHIP_TONES.rose,
  },
  // Une décision, distincte de Raté qui est un constat (design #32).
  abandoned: {
    label: 'Abandonné',
    badgeClassName: CHIP_TONES.neutral,
  },
}

/**
 * Le projet tourne-t-il encore — ni réussi, ni raté, ni abandonné ?
 *
 * Trois écrans écrivaient `status === 'todo'` pour poser cette question, ce qui
 * était juste tant que « pas conclu » n'avait qu'une valeur. L'arrivée de
 * `in_progress` les aurait tous cassés en silence : la carte perdait son étape
 * courante, le tableau de bord cessait de compter.
 */
export function isProjectOpen(status: ProjectStatus): boolean {
  return status === 'todo' || status === 'in_progress'
}

/** L'issue d'un projet clos — les trois sorties (design #32). */
export type ProjectIssue = 'achieved' | 'failed' | 'abandoned'

/** L'issue, si le projet est clos ; `null` tant qu'il tourne. */
export function projectIssue(status: ProjectStatus): ProjectIssue | null {
  return status === 'achieved' || status === 'failed' || status === 'abandoned'
    ? status
    : null
}
