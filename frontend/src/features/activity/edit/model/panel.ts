import type { ActivityLink } from '@/entities/activity'
import type { ActivityType } from '@/entities/activity-type'
import type { Metric, ProjectMetric } from '@/entities/metric'
import {
  type Project,
  type ProjectStep,
  type ProgressLine,
  progressLines,
  stepProgressLines,
  totalCounts,
} from '@/entities/project'
import type { Unit } from '@/entities/unit'
import { unitLabel } from '@/shared/lib/units'
import { shortDay } from '@/shared/ui'

/** Un lien édité dans le panneau : un projet, son étape facultative. */
export type LinkDraft = ActivityLink

/** Ce qu'un Total lit d'une activité pour savoir s'il la compte. */
export interface CountedActivity {
  activity_type_id: string | null
  acts: readonly unknown[]
}

/** L'activité telle qu'un Total la mesure, pour savoir s'il la compte. */
const asMeasured = (activity: CountedActivity) => ({
  ...activity,
  all_day: false,
  start_at: null,
  end_at: null,
  values: [],
})

/**
 * Les barres d'un lien : les **seuls** Totaux que l'activité alimente — ceux
 * qui comptent son activité type, ses séances d'apprentissage, ou toutes les
 * activités (#44). Rattachée à une étape, la barre est la tranche de cette
 * étape quand elle en a une ; sinon celle du projet. Ordre : celui des
 * barres du projet (l'objectif en tête d'abord).
 */
export function fedLines(
  project: Project,
  stepId: string | null,
  activity: CountedActivity,
): ProgressLine[] {
  const measured = asMeasured(activity)
  const fed = new Set(
    project.totals.filter((t) => totalCounts(t, measured)).map((t) => t.id),
  )
  if (fed.size === 0) return []
  const step = stepId ? project.steps.find((s) => s.id === stepId) : null
  const tranches = step ? stepProgressLines(step, project) : []
  return progressLines(project)
    .filter((l) => fed.has(l.key))
    .map((l) => tranches.find((t) => t.key === l.key) ?? l)
}

/** « 18.1/120 km » — ce qui suit la barre d'un lien. */
export function lineValue(line: ProgressLine): string {
  return `${line.short} ${unitLabel(line.unit, line.max)}`.trimEnd()
}

/** « 14 sept. → 23 nov. », ou rien pour une étape sans dates. */
export function stepDates(step: ProjectStep): string {
  if (step.start_at && step.due_at) {
    const [, m1] = step.start_at.split('-')
    const [, m2] = step.due_at.split('-')
    const from = shortDay(step.start_at)
    return m1 === m2
      ? `${from.split(' ')[0]} → ${shortDay(step.due_at)}`
      : `${from} → ${shortDay(step.due_at)}`
  }
  if (step.start_at) return `dès le ${shortDay(step.start_at)}`
  if (step.due_at) return `jusqu'au ${shortDay(step.due_at)}`
  return ''
}

/** Une unité de durée ne se déclare pas : elle se lit au calendrier. */
const declarable = (u: Unit | null | undefined): u is Unit =>
  Boolean(u) && !u!.seconds_per_unit

/**
 * Les unités attendues au Totaux : celle de l'activité type, puis celles des
 * Totaux en valeur des projets liés **qui comptent l'activité**, comme la
 * barre (#44). On suggère l'unité, jamais la valeur (24/09/2026).
 */
export function suggestedUnits(
  activityType: ActivityType | undefined,
  projects: Project[],
  activity: CountedActivity,
): Unit[] {
  const measured = asMeasured(activity)
  const out = new Map<string, Unit>()
  const add = (u: Unit | null | undefined) => {
    if (declarable(u) && !out.has(u.id)) out.set(u.id, u)
  }
  add(activityType?.unit)
  for (const o of projects)
    for (const t of o.totals)
      if (t.mode === 'value' && totalCounts(t, measured)) add(t.unit)
  return [...out.values()]
}

/** Les métriques attendues aux Résultats : celles des Résultats des projets liés. */
export function suggestedMetrics(results: ProjectMetric[]): Metric[] {
  const out = new Map<string, Metric>()
  for (const r of results)
    if (!out.has(r.metric_id)) out.set(r.metric_id, r.metric)
  return [...out.values()]
}
