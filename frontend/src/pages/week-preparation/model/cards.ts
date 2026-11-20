import { type Activity, countsFor } from '@/entities/activity'
import type { Ghost } from '@/entities/activity-type'
import {
  isProjectOpen,
  type Project,
  type WeekActivity,
  weekAhead,
  type WeekAhead,
  type WeekScope,
  weekScope,
  weekStep,
} from '@/entities/project'
import type { WeekSteps } from '@/entities/preparation'
import { startOfDay, toDateISO } from '@/shared/lib/date'

import type { PreparationWeeks } from './weeks'

/** Ce que la liste dit d'un projet (#92, point 2). */
export interface PreparationCard {
  project: Project
  /** La barre la plus précise : l'étape de la semaine prochaine si elle
   *  distribue — celle choisie, sinon celle qui couvre son lundi (#183) —,
   *  sinon le projet (`weekScope`) ; `null` sans Total. */
  scope: WeekScope | null
  /** Le prévu jusqu'à la fin de la semaine prochaine, par barre. */
  ahead: Map<string, WeekAhead>
  /** Les séances de la semaine écoulée passées sans être faites. */
  missed: number
  /** Les séances de la semaine prochaine, posées ou pas encore (fantômes). */
  planned: number
}

const at = (iso: string | null) => (iso ? new Date(iso) : null)
const within = (d: Date | null, from: Date, to: Date) =>
  d !== null && d >= from && d < to

/**
 * Les cartes de la préparation : un projet **en cours** — ouvert, et dont
 * la période touche l'une des deux semaines.
 *
 * - **Non faites** : une séance de la semaine écoulée, pas cochée — celles du
 *   jour de la préparation comprises (pas de traitement de faveur), qu'elle
 *   porte une interro ou non.
 * - **Prévues** : les séances de la semaine prochaine, fantômes compris — ce
 *   que la planification y posera.
 */
export function preparationCards(
  projects: Project[],
  activities: Activity[],
  ghosts: Ghost[],
  weeks: PreparationWeeks,
  now: Date,
  steps: Record<string, WeekSteps> = {},
): PreparationCard[] {
  const today = startOfDay(now)
  const todayStr = toDateISO(today)
  const firstDay = toDateISO(weeks.past.start)
  const lastDay = toDateISO(new Date(weeks.next.end.getTime() - 1))
  const ahead: WeekActivity[] = [
    ...activities,
    ...ghosts.map((g) => ({ ...g, done: false, acts: [], values: [] })),
  ]
  return projects
    .filter(
      (o) =>
        isProjectOpen(o.status) &&
        o.start_at.slice(0, 10) <= lastDay &&
        // Sans fin (#196) : toutes les semaines dès son début.
        (o.due_at === null || o.due_at.slice(0, 10) >= firstDay),
    )
    .map((project) => {
      const scope = weekScope(
        project,
        todayStr,
        weekStep(
          project,
          toDateISO(weeks.next.start),
          todayStr,
          steps[project.id]?.next ?? null,
        ),
      )
      const missed = activities.filter(
        (a) =>
          countsFor(a, project.id) &&
          !a.done &&
          within(at(a.start_at), weeks.past.start, weeks.past.end),
      ).length
      const planned =
        activities.filter(
          (a) =>
            countsFor(a, project.id) &&
            within(at(a.start_at), weeks.next.start, weeks.next.end),
        ).length +
        ghosts.filter(
          (g) =>
            countsFor(g, project.id) &&
            within(at(g.start_at), weeks.next.start, weeks.next.end),
        ).length
      return {
        project,
        scope,
        ahead: scope
          ? weekAhead(
              project,
              scope,
              ahead,
              weeks.next.start,
              weeks.next.end,
              today,
            )
          : new Map(),
        missed,
        planned,
      }
    })
}
