import { formatValue, unitLabel } from '@/shared/lib/units'

import type { ProjectMetric } from './types'

/**
 * La géométrie du **fil** d'un résultat visé (design #27) : du départ à la
 * cible, le record de la saison posé dessus. Partagée par la carte et par le
 * suivi de l'en-tête (design #36 : « même calcul que la carte »).
 *
 * Le départ vient du back (`start`) : le record d'avant la saison si la cible
 * est au moins aussi exigeante, sinon le premier relevé de la saison. Jamais
 * d'« atteint d'office » : c'est `is_met`, le record de la saison, qui décide.
 */
export interface ResultThreadGeometry {
  /** Le départ, s'il y a un relevé. */
  dep: number | null
  /** Le record de la saison, s'il y en a un. */
  rec: number | null
  reached: boolean
  /** Le record est en deçà du départ. */
  recul: boolean
  /** `a` vaut au moins `b`, dans le sens de la métrique. */
  better: (a: number, b: number) => boolean
  /** La position d'une valeur sur le fil, de 0 (départ) à 100 (cible). */
  p: (v: number) => number
  /** Jusqu'où le fil est parcouru, de 0 à 100. */
  filled: number
}

export function resultThread(link: ProjectMetric): ResultThreadGeometry {
  const { metric, target } = link
  const down = metric.direction === 'down'
  const better = (a: number, b: number) => (down ? a <= b : a >= b)
  const dep = link.start?.value ?? null
  const rec = link.best_in_period?.value ?? null
  const reached = link.is_met

  const p = (v: number) => {
    if (dep === null || dep === target) return 100
    const r = down ? (dep - v) / (dep - target) : (v - dep) / (target - dep)
    return Math.max(0, Math.min(1, r)) * 100
  }
  return {
    dep,
    rec,
    reached,
    recul: rec !== null && dep !== null && !better(rec, dep),
    better,
    p,
    filled: reached ? 100 : rec !== null && dep !== null ? p(rec) : 0,
  }
}

/** « 10KM à 49:59 min » — la cible d'un résultat visé, sans son sens : ce
 *  que dit une chip de l'en-tête, où « ou moins » prenait la place pour rien. */
export function resultTarget(link: ProjectMetric): string {
  const { metric, target } = link
  const unit = unitLabel(metric.unit, target)
  return `${metric.name} à ${formatValue(target, metric.unit)}${unit ? ` ${unit}` : ''}`
}
