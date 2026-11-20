import {
  expectedShare,
  type Pacing,
  pacing,
  totalUnit,
  worstPacing,
} from './progress'
import type { Project, ProjectStep, Total } from './types'
import { type UnitMark, totalMarkIn } from './unit-mark'
import { type UnitLike, unitLabel } from '@/shared/lib/units'

const WEEK = 7 * 86_400_000

/** De quoi la carte de rythme parle : un projet, une étape, un Total. */
export type PaceScope =
  | { kind: 'project' }
  | { kind: 'step'; step: ProjectStep }
  | { kind: 'total'; total: Total }
  | { kind: 'week'; step: ProjectStep }

/**
 * Une ligne de la carte de rythme (#112, `kit/Carte rythme`) : un objectif, où
 * il en est, ce qui est attendu à date, et les deux rythmes — l'actuel
 * (moyenne depuis le début de la période, projetée à l'échéance) et celui à
 * tenir pour atteindre la cible.
 */
export interface PaceRow {
  key: string
  mark: UnitMark | null
  /** Les activités types comptées, sinon les séances d'apprentissage, sinon
   *  l'unité. */
  name: string
  unit: UnitLike
  pace: Pacing | null
  value: number
  target: number
  /** La cible atteinte : plus de rythme à tenir. */
  reached: boolean
  /** L'échéance de sa période (de l'étape pour une tranche). */
  due: string
  /** Ce qu'il faudrait avoir fait aujourd'hui. */
  expected: number
  /** Fraction accomplie − fraction de temps écoulée (cf. `pacing`). */
  gap: number
  /** Par semaine depuis le début ; nul avant une semaine écoulée. */
  weekly: number | null
  /** Au rythme actuel, à l'échéance ; nul avec `weekly`. */
  projected: number | null
  /** Par semaine, jusqu'à l'échéance ; nul la cible atteinte ou l'échéance
   *  passée. */
  needed: number | null
}

const LEARNING = "Séances d'apprentissage"

/** Ce que compte un Total, nommé : « Tennis », « Leçon et Tennis ». */
function totalName(total: Total, project: Project): string {
  const names = total.activity_type_ids.map(
    (id) =>
      project.activity_types.find((t) => t.activity_type_id === id)?.title ??
      'Activité type',
  )
  if (total.learning_sessions) names.push(LEARNING)
  if (names.length === 0) {
    const unit = totalUnit(total)
    const word = unitLabel(unit, 2)
    return word.charAt(0).toUpperCase() + word.slice(1)
  }
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`
}

/** Un objectif de la carte, avant calcul : sa période, et s'il est une
 *  tranche d'étape. */
interface Item {
  total: Total
  value: number
  target: number
  start_at: string | null
  due_at: string | null
  tranche: boolean
}

/**
 * Les lignes de la carte de rythme, **du pire au meilleur** (l'écart le plus
 * négatif d'abord, les cibles atteintes à la fin) : pour un projet ses
 * Totaux sur sa période, pour une étape ses tranches sur la sienne, pour un
 * Total lui seul ; pour **la semaine** d'un projet (sa carte, cf.
 * `weekScope`), les tranches de l'étape en cours sur sa période et les
 * Totaux qu'aucune étape ne porte sur celle du projet. Un objectif sans
 * période complète n'a pas de ligne.
 */
export function paceRows(
  project: Project,
  scope: PaceScope,
  today: string,
): PaceRow[] {
  const byId = new Map(project.totals.map((t) => [t.id, t]))
  const whole = (total: Total): Item => ({
    total,
    value: total.progress,
    target: total.target,
    start_at: project.start_at,
    due_at: project.due_at,
    tranche: false,
  })
  const tranches = (step: ProjectStep): Item[] =>
    step.totals.flatMap((share) => {
      const total = byId.get(share.total_id)
      return total
        ? [
            {
              total,
              value: share.progress,
              target: share.target,
              start_at: step.start_at,
              due_at: step.due_at,
              tranche: true,
            },
          ]
        : []
    })
  const distributed = new Set(
    project.steps.flatMap((s) => s.totals.map((share) => share.total_id)),
  )
  const items: Item[] =
    scope.kind === 'project'
      ? project.totals.map(whole)
      : scope.kind === 'total'
        ? [whole(scope.total)]
        : scope.kind === 'step'
          ? tranches(scope.step)
          : [
              ...tranches(scope.step),
              ...project.totals
                .filter((t) => !distributed.has(t.id))
                .map(whole),
            ]
  const now = Date.parse(today)

  const rows = items.flatMap((item): PaceRow[] => {
    const { total, value, target, start_at, due_at } = item
    if (!start_at || !due_at) return []
    const start = Date.parse(start_at)
    const due = Date.parse(due_at)
    const span = Math.max(0, due - start)
    const t = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 1
    const elapsed = Math.max(0, now - start) / WEEK
    const left = Math.max(0, due - now) / WEEK
    const reached = value >= target
    const weekly = elapsed >= 1 ? value / elapsed : null
    // Sur la période du projet, un Total attend ce que ses tranches
    // d'étape attendent à date ; une tranche, le temps écoulé de son étape.
    const share = item.tranche ? t : (expectedShare(total, project, today) ?? t)
    return [
      {
        key: total.id,
        mark: totalMarkIn(total, project),
        name: totalName(total, project),
        unit: totalUnit(total),
        pace: pacing(
          { target, progress: value, start_at, due_at },
          today,
          share,
        ),
        value,
        target,
        reached,
        due: due_at,
        expected: target * share,
        gap: target > 0 ? value / target - share : 0,
        weekly,
        projected: weekly === null ? null : weekly * (span / WEEK),
        needed: !reached && left > 0 ? (target - value) / left : null,
      },
    ]
  })
  return rows.sort(
    (a, b) => Number(a.reached) - Number(b.reached) || a.gap - b.gap,
  )
}

/** Le rythme que disent des lignes : le pire (les conditions se cumulent). */
export function rowsPacing(rows: PaceRow[]): Pacing | null {
  return worstPacing(rows.map((r) => r.pace))
}

/** Un onglet de la carte de rythme (#114) : ce qu'il nomme, son rythme et
 *  ses lignes. */
export interface PaceTab {
  key: string
  name: string
  pace: Pacing | null
  rows: PaceRow[]
}

/**
 * Les deux onglets de la carte de rythme d'une **carte de projet** (#114),
 * là où l'écran ne sépare pas l'étape du projet : l'étape en cours (ce
 * que montre la carte, cf. `paceRows` en `week`) puis le projet entier
 * (ses Totaux sur sa période). Nul sans étape en cours qui porte une tranche :
 * la carte parle alors déjà du projet.
 */
export function paceTabs(
  project: Project,
  step: ProjectStep | null,
  today: string,
): PaceTab[] | null {
  if (!step) return null
  const tab = (key: string, name: string, scope: PaceScope): PaceTab => {
    const rows = paceRows(project, scope, today)
    return { key, name, pace: rowsPacing(rows), rows }
  }
  return [
    tab(step.id, step.title, { kind: 'week', step }),
    tab(project.id, project.title, { kind: 'project' }),
  ]
}
