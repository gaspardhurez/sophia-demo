import {
  addDays,
  daysBetween,
  fmtShortDate,
  toDateISO,
} from '@/shared/lib/date'

import { RECALL_INTERVALS, recallStep } from './recall'
import type { AcquisitionPlan } from './types'

/**
 * Où en est l'Étude d'un cycle (#157, `kit/Phases cycle`) : elle se lit sur
 * son interro, maîtrisée quand la courbe atteint le **seuil** du cycle
 * (`recall_target`).
 *
 * - `nonlancee` : des questions, la courbe pas lancée (« Lancer le test ») ;
 * - `lancee` : la courbe en marche, rien de dû ;
 * - `due` : l'interro est due aujourd'hui, ou en retard ;
 * - `terminee` : le seuil est atteint ;
 * - `sans` : aucune question, l'étude se valide à la main ;
 * - `validee` : validée à la main — elle le reste, même si des questions
 *   arrivent ensuite (plus aucun geste).
 */
export type StudyState =
  'nonlancee' | 'lancee' | 'due' | 'terminee' | 'sans' | 'validee'

/** La courbe de l'interro a été lancée (en marche ou terminée). */
export function recallLaunched(plan: AcquisitionPlan): boolean {
  return (
    plan.recall_launched_at != null ||
    plan.recall_stage != null ||
    plan.recall_finished
  )
}

export function studyState(
  plan: AcquisitionPlan,
  today: Date = new Date(),
): StudyState {
  if (plan.study_validated_at) return 'validee'
  const launched = recallLaunched(plan)
  // Une étude déclarée terminée sans questions avant #157 reste maîtrisée,
  // sans courbe : elle se lit validée.
  if (plan.study_mastered) return launched ? 'terminee' : 'validee'
  if (!launched) return plan.question_count > 0 ? 'nonlancee' : 'sans'
  if (recallReached(plan) >= plan.recall_target) return 'terminee'
  const due = plan.recall_next_due_at
  return due != null && due <= toDateISO(today) ? 'due' : 'lancee'
}

/** Les crans franchis, bornés au seuil : le seuil atteint, tous. */
export function recallReached(plan: AcquisitionPlan): number {
  if (plan.study_mastered && recallLaunched(plan)) return plan.recall_target
  const n = plan.recall_finished
    ? RECALL_INTERVALS.length
    : (plan.recall_stage ?? 0)
  return Math.min(n, plan.recall_target)
}

/** « Terminée à J+15 · 3 tests » : le seuil, tel que Modifier le règle. */
export function recallTargetLabel(target: number): string {
  return `Terminée à ${recallStep(target - 1)} · ${target} test${target > 1 ? 's' : ''}`
}

const at = (iso: string) => new Date(`${iso}T00:00:00`)

/** « jeu. 15 » à moins d'une semaine, la date courte au-delà. */
function dayLabel(d: Date, today: Date): string {
  return Math.abs(daysBetween(today, d)) < 7
    ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
    : fmtShortDate(d)
}

/**
 * Ce que la ligne Interro dit à droite (`kit/Phases cycle`) : le nombre de
 * questions (pas lancée), la prochaine échéance — « demain », « jeu. 15 ·
 * Tennis » quand une séance la porte (`session`) —, « aujourd'hui » (due),
 * « depuis lun. 12 » (en retard), « J+15 ✓ » (terminée).
 */
export function recallNextLabel(
  plan: AcquisitionPlan,
  {
    session,
    today = new Date(),
  }: { session?: string | null; today?: Date } = {},
): string {
  const state = studyState(plan, today)
  if (state === 'nonlancee')
    return `${plan.question_count} question${plan.question_count > 1 ? 's' : ''}`
  if (state === 'terminee') return `${recallStep(plan.recall_target - 1)} ✓`
  const due = plan.recall_next_due_at
  if (!due || state === 'sans' || state === 'validee') return ''
  const iso = toDateISO(today)
  if (due === iso) return "aujourd'hui"
  if (due < iso) return `depuis ${dayLabel(at(due), today)}`
  const day =
    due === toDateISO(addDays(today, 1)) ? 'demain' : dayLabel(at(due), today)
  return session ? `${day} · ${session}` : day
}
