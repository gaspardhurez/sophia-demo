import type { ActivityLink } from '@/entities/activity'
import type { MetricDirection, ProjectMetric } from '@/entities/metric'
import {
  type MeasuredActivity,
  type Project,
  type UnitMark,
  totalMeasure,
} from '@/entities/project'
import type { UnitLike } from '@/shared/lib/units'

import { fedLines } from './panel'

/**
 * Une jauge de la coche (#177) : un Total que la séance alimente — sa
 * tranche d'étape quand le lien en porte une, comme la barre du panneau —,
 * où il en est (`before`) et ce que la séance y ajoute (`gain`).
 */
export interface CheckGauge {
  key: string
  /** Le projet du Total : la coche range ses jauges par projet (#182). */
  projectId: string
  /** Un Total en valeur : l'unité dont la séance déclare l'apport — sa
   *  pastille se saisit. Au nombre ou en durée, l'apport se lit. */
  unitId: string | null
  mark: UnitMark | null
  before: number
  gain: number
  max: number
  unit: UnitLike
}

/**
 * Les jauges des Totaux à la coche : pour chaque projet lié, les Totaux
 * que la séance alimente, et son apport tel que le back le comptera une fois
 * la séance faite (`totalMeasure` : 1 au nombre, sa durée, ou ses valeurs —
 * celles du brouillon, en direct).
 */
export function checkGauges(
  projects: Project[],
  links: Pick<ActivityLink, 'project_id' | 'step_id'>[],
  activity: MeasuredActivity,
): CheckGauge[] {
  return links.flatMap((link) => {
    const o = projects.find((x) => x.id === link.project_id)
    if (!o) return []
    return fedLines(o, link.step_id, activity).flatMap((line) => {
      const total = o.totals.find((t) => t.id === line.key)
      if (!total || line.max <= 0) return []
      return [
        {
          key: `${o.id}-${line.key}`,
          projectId: o.id,
          unitId: total.mode === 'value' ? (total.unit?.id ?? null) : null,
          mark: line.mark,
          before: line.value,
          gain: totalMeasure(total, activity),
          max: line.max,
          unit: line.unit,
        },
      ]
    })
  })
}

/** Ce qu'un relevé de la coche a pour repères : la cible, le record. */
export interface ResultMarks {
  /** La cible la plus exigeante des projets liés. */
  target: number | null
  /** Le record absolu de la métrique (`metric.best`). */
  record: number | null
  direction: MetricDirection
}

/** Les repères de chaque métrique des Résultats des projets liés. */
export function resultMarks(
  results: ProjectMetric[],
): Map<string, ResultMarks> {
  const out = new Map<string, ResultMarks>()
  for (const r of results) {
    const direction = r.metric.direction
    const prev = out.get(r.metric_id)
    const target =
      prev?.target == null
        ? r.target
        : direction === 'down'
          ? Math.min(prev.target, r.target)
          : Math.max(prev.target, r.target)
    out.set(r.metric_id, {
      target,
      record: r.metric.best?.value ?? null,
      direction,
    })
  }
  return out
}

/** `value` atteint-il `bar` dans le sens de la métrique ? */
export function reaches(
  value: number,
  bar: number,
  direction: MetricDirection,
  strict = false,
): boolean {
  if (direction === 'down') return strict ? value < bar : value <= bar
  return strict ? value > bar : value >= bar
}
