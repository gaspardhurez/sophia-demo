import {
  type ProjectMetric,
  resultTarget,
  resultThread,
} from '@/entities/metric'
import {
  type Project,
  progressLines,
  totalMarkIn,
  totalUnit,
  type UnitMark,
} from '@/entities/project'
import { formatValue, unitLabel } from '@/shared/lib/units'

/**
 * Le suivi de l'en-tête (design #34 et #36, kit/Suivi) : une chip par objectif,
 * dans l'ordre des cartes — Totaux, Apprentissage, Résultats, Réalisations.
 * Totaux, Apprentissage et Résultats se **suivent** : on les choisit, la barre
 * de l'en-tête les montre (le fil, pour un Résultat). Les Réalisations se
 * lisent seulement.
 */
export type TrackingChip =
  | {
      kind: 'total'
      id: string
      mark: UnitMark | null
      /** « 80 » — n'apparaît que sur la chip choisie ou survolée. */
      value: string
      /** « 200 h », « 60 exos ». */
      target: string
      /** « 200 heures » : la cible en toutes lettres, pour le résumé de la
       *  création (design #33). */
      fullTarget: string
      pct: number
    }
  | {
      kind: 'learning'
      id: string
      value: string
      target: string
      pct: number
      /** Le niveau de chaque savoir visé (0 à 4), un bloc chacun. */
      levels: number[]
    }
  | {
      kind: 'result'
      id: string
      emoji: string | null
      sentence: string
      /** Jusqu'où le fil départ → cible est parcouru (même calcul que la
       *  carte, design #36). */
      pct: number
      /** « 48:00 » : le record de la saison, dans la bulle du fil. */
      record: string | null
      /** « 52 » : le départ, s'il y a un relevé. */
      start: string | null
      /** « 45 » : la cible, au drapeau. */
      target: string
      reached: boolean
    }
  | {
      kind: 'achievement'
      id: string
      emoji: string | null
      title: string
      done: boolean
    }

export type TrackedChip = Extract<
  TrackingChip,
  { kind: 'total' | 'learning' | 'result' }
>

export const LEARNING_ID = 'learning'

/** La marque de la chip Apprentissage (« 👨‍🎓 22 savoirs »). */
export const LEARNING_EMOJI = '👨‍🎓'

const num = (n: number) => formatValue(Math.round(n * 100) / 100, null)
const pctOf = (value: number, max: number) =>
  max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 100

export function trackingChips(
  project: Project,
  results: ProjectMetric[],
): TrackingChip[] {
  const totals = [...project.totals]
    .sort((a, b) => a.position - b.position)
    .map((total): TrackingChip => {
      // Les heures s'abrègent en « h » : la chip est une étiquette, pas une
      // phrase (kit/Suivi).
      const unit =
        total.mode === 'duration'
          ? 'h'
          : unitLabel(totalUnit(total), total.target)
      return {
        kind: 'total',
        id: total.id,
        mark: totalMarkIn(total, project),
        value: num(total.progress),
        target: `${num(total.target)} ${unit}`.trimEnd(),
        fullTarget:
          `${num(total.target)} ${unitLabel(totalUnit(total), total.target)}`.trimEnd(),
        pct: pctOf(total.progress, total.target),
      }
    })
  const resultChips = results.map((link): TrackingChip => {
    const best = link.best_in_period
    const unit = link.metric.unit
    const thread = resultThread(link)
    return {
      kind: 'result',
      id: link.metric_id,
      emoji: link.metric.emoji ?? null,
      sentence: resultTarget(link),
      pct: thread.filled,
      // La valeur seule, comme le départ et la cible (réponse #43).
      record: best ? formatValue(best.value, unit) : null,
      start: thread.dep !== null ? formatValue(thread.dep, unit) : null,
      target: formatValue(link.target, unit),
      reached: thread.reached,
    }
  })
  const achievements = project.achievements.map((a): TrackingChip => ({
    kind: 'achievement',
    id: a.id,
    emoji: a.emoji,
    title: a.title,
    done: a.done,
  }))
  const skills = project.learning
  const acquired = skills.filter((s) => s.level === 4).length
  const learning: TrackingChip[] =
    skills.length > 0
      ? [
          {
            kind: 'learning',
            id: LEARNING_ID,
            value: String(acquired),
            target: `${skills.length} savoir${skills.length > 1 ? 's' : ''}`,
            pct: pctOf(acquired, skills.length),
            levels: skills.map((s) => s.level),
          },
        ]
      : []
  // L'ordre des objectifs partout où ils se listent ensemble (design #36).
  return [...totals, ...learning, ...resultChips, ...achievements]
}

/**
 * La chip suivie par défaut : le Total le plus pressant, dans l'ordre de
 * `progressLines` (celui qui retient le projet), sinon le premier objectif
 * suivable dans l'ordre des chips — l'Apprentissage, puis le premier Résultat.
 */
export function defaultTracked(
  project: Project,
  chips: TrackingChip[],
  today: string,
): string | null {
  const first = progressLines(project, today)[0]
  if (first) return first.key
  return chips.find(isTracked)?.id ?? null
}

export const isTracked = (c: TrackingChip): c is TrackedChip =>
  c.kind !== 'achievement'
