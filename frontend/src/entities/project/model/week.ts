import {
  countsIn,
  currentStep,
  type MeasuredActivity,
  progressLines,
  type ProgressLine,
  stepProgressLines,
  totalMeasure,
} from './progress'
import type { Project, ProjectStep } from './types'
import { addDays, toDateISO } from '@/shared/lib/date'

/**
 * Ce qu'une semaine lit d'un projet, **Total par Total** (#91) : la
 * tranche de l'étape en cours quand elle en porte une — c'est ce qu'on
 * regarde en semaine —, le Total du projet quand il n'est distribué à
 * aucune étape ; un Total distribué à d'autres étapes, mais pas à celle en
 * cours, n'en fait pas partie.
 */
export interface WeekScope {
  /** L'étape en cours, si au moins une barre est sa tranche. */
  step: ProjectStep | null
  /** La clé du projet dans une liste : l'étape si elle porte une
   *  tranche, sinon le projet. */
  scopeId: string
  lines: ProgressLine[]
  /** Pour chaque barre, ce à quoi une activité doit être rattachée pour y
   *  compter : l'étape (une tranche) ou le projet. */
  lineScope: Map<string, { step: boolean; id: string }>
}

export function weekScope(
  o: Project,
  todayStr: string,
  /** L'étape choisie pour la semaine (#183) ; à défaut, celle en cours. */
  chosen?: ProjectStep | null,
): WeekScope | null {
  const step = chosen !== undefined ? chosen : currentStep(o, todayStr)
  const stepLines = step ? stepProgressLines(step, o) : []
  const inStep = new Set(stepLines.map((l) => l.key))
  const distributed = new Set(
    o.steps.flatMap((s) => s.totals.map((share) => share.total_id)),
  )
  const projectLines = progressLines(o, todayStr).filter(
    (l) => !inStep.has(l.key) && !distributed.has(l.key),
  )
  const lines = [...stepLines, ...projectLines]
  if (lines.length === 0) return null
  const lineScope = new Map(
    lines.map((l) => [
      l.key,
      inStep.has(l.key) && step
        ? { step: true, id: step.id }
        : { step: false, id: o.id },
    ]),
  )
  return {
    step: stepLines.length > 0 ? step : null,
    scopeId: stepLines.length > 0 && step ? step.id : o.id,
    lines,
    lineScope,
  }
}

/**
 * L'étape qui borne une semaine du rituel (#183) — la règle du serveur
 * (`domain/preparation.week_step`), à tenir d'accord : celle choisie si elle
 * croise la semaine ; sinon celle qui couvre son lundi ; sinon la première
 * qui la croise ; sinon l'étape en cours.
 */
export function weekStep(
  o: Project,
  weekStartStr: string,
  todayStr: string,
  chosenId: string | null = null,
): ProjectStep | null {
  const last = toDateISO(addDays(new Date(`${weekStartStr}T00:00:00`), 6))
  const spans = o.steps.filter(
    (s) =>
      s.start_at && s.due_at && s.start_at <= last && s.due_at >= weekStartStr,
  )
  return (
    spans.find((s) => s.id === chosenId) ??
    spans.find((s) => s.start_at! <= weekStartStr) ??
    spans[0] ??
    currentStep(o, todayStr)
  )
}

/** Une activité telle que la semaine la lit. */
export interface WeekActivity extends MeasuredActivity {
  done: boolean
  /** Les projets pour lesquels elle compte, chacun avec son étape (#37). */
  projects: { project_id: string; step_id: string | null }[]
}

/** Ce qu'une barre a devant elle : le cumul jusqu'à la fin de la semaine
 *  affichée, et la part de cette seule semaine. */
export interface WeekAhead {
  cumul: number
  week: number
}

/** L'activité compte-t-elle pour cette barre (sa tranche ou son projet) ? */
const countsForLine = (scope: WeekScope, key: string, a: WeekActivity) => {
  const target = scope.lineScope.get(key)
  if (!target) return false
  return a.projects.some((link) =>
    target.step ? link.step_id === target.id : link.project_id === target.id,
  )
}

/**
 * La séance **compte-t-elle** pour cette barre : rattachée à sa tranche (ou au
 * projet), et dans ce que son Total compte (son « sur ») — la règle de
 * `weekAhead`, pour lister les séances d'un Total (#147).
 */
export function countsForWeekLine(
  project: Project,
  scope: WeekScope,
  key: string,
  a: WeekActivity,
): boolean {
  const total = project.totals.find((t) => t.id === key)
  return (
    total !== undefined && countsForLine(scope, key, a) && countsIn(total, a)
  )
}

/**
 * Le prévisionnel d'une semaine, par barre — la mécanique de la barre du
 * calendrier (design #27).
 *
 * Il est **cumulatif** : d'aujourd'hui jusqu'à la fin de la semaine affichée.
 * Sinon une semaine lointaine montrerait sa maigre contribution comme si les
 * semaines qui la précèdent n'existaient pas. La part de la semaine seule se
 * lit à côté : c'est elle qui dit si on a assez planifié.
 *
 * Chaque barre est un Total (sa clé est son id) : il compte selon son mode,
 * cf. `totalMeasure`.
 */
export function weekAhead(
  project: Project,
  scope: WeekScope,
  activities: WeekActivity[],
  weekStart: Date,
  weekEnd: Date,
  today: Date,
): Map<string, WeekAhead> {
  const out = new Map<string, WeekAhead>()
  if (weekEnd <= today) return out
  const weekFrom = weekStart > today ? weekStart : today
  const totalById = new Map(project.totals.map((t) => [t.id, t]))
  for (const a of activities) {
    if (a.done || !a.start_at) continue
    const at = new Date(a.start_at)
    if (at < today || at >= weekEnd) continue
    const inWeek = at >= weekFrom
    for (const line of scope.lines) {
      const total = totalById.get(line.key)
      if (!total || !countsForLine(scope, line.key, a)) continue
      const n = totalMeasure(total, a)
      const row = out.get(line.key) ?? { cumul: 0, week: 0 }
      row.cumul += n
      if (inWeek) row.week += n
      out.set(line.key, row)
    }
  }
  return out
}

/**
 * La semaine **joue-t-elle** pour ce projet ? Oui dès qu'une activité de
 * la semaine — faite ou non, passée ou à venir — ajoute quelque chose à l'une
 * de ses barres.
 *
 * Toute la semaine, et pas seulement ce qui reste : sinon le projet sortait
 * du panneau dès sa dernière séance passée, au milieu d'une semaine où il a
 * bel et bien compté.
 */
export function weekCounts(
  project: Project,
  scope: WeekScope,
  activities: WeekActivity[],
  weekStart: Date,
  weekEnd: Date,
): boolean {
  const totalById = new Map(project.totals.map((t) => [t.id, t]))
  return activities.some((a) => {
    if (!a.start_at) return false
    const at = new Date(a.start_at)
    if (at < weekStart || at >= weekEnd) return false
    return scope.lines.some((line) => {
      const total = totalById.get(line.key)
      return (
        total !== undefined &&
        countsForLine(scope, line.key, a) &&
        totalMeasure(total, a) > 0
      )
    })
  })
}

/** Ce qui a été **fait** dans une semaine passée, par barre. */
export function weekDone(
  project: Project,
  scope: WeekScope,
  activities: WeekActivity[],
  weekStart: Date,
  weekEnd: Date,
): Map<string, number> {
  const out = new Map<string, number>()
  const totalById = new Map(project.totals.map((t) => [t.id, t]))
  for (const a of activities) {
    if (!a.done || !a.start_at) continue
    const at = new Date(a.start_at)
    if (at < weekStart || at >= weekEnd) continue
    for (const line of scope.lines) {
      const total = totalById.get(line.key)
      if (total && countsForLine(scope, line.key, a))
        out.set(line.key, (out.get(line.key) ?? 0) + totalMeasure(total, a))
    }
  }
  return out
}
