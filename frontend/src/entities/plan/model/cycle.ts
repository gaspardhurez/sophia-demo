import { fmtShortDate } from '@/shared/lib/date'

import type { PhaseKey } from './phases'
import type { PhaseProgress } from './progress'
import type { AcquisitionPlan } from './types'

/**
 * Où en est un cycle, tel que la page le lit : **à clore** n'est pas un état
 * du modèle (le cycle reste actif), c'est un actif dont tout est validé — rien
 * ne se clôt seul, l'écran propose de terminer.
 */
export type CycleStage =
  'planned' | 'active' | 'toClose' | 'acquired' | 'abandoned'

export function cycleStage(plan: AcquisitionPlan): CycleStage {
  switch (plan.state) {
    case 'draft':
      return 'planned'
    case 'active':
      return plan.is_satisfied ? 'toClose' : 'active'
    case 'completed':
      return 'acquired'
    default:
      return 'abandoned'
  }
}

/**
 * Le nom d'un cycle, tel que l'onglet le montre (design #65) : son nom, sinon
 * ses projets (« 🎯 A · 🎯 B »), sinon « Cycle *n* » — son rang parmi les
 * cycles du savoir, du plus ancien au plus récent.
 */
export function cycleName(
  plan: AcquisitionPlan,
  plans: AcquisitionPlan[],
  projectTitle: (id: string) => string,
): string {
  if (plan.name) return plan.name
  if (plan.project_ids.length > 0)
    return plan.project_ids.map((id) => `🎯 ${projectTitle(id)}`).join(' · ')
  return `Cycle ${plans.findIndex((p) => p.id === plan.id) + 1}`
}

/** Les dates d'un cycle, en une ligne : « depuis le … », « … → … » ; rien
 * pour un cycle prévu, qui n'a pas de date. */
export function cycleDates(plan: AcquisitionPlan): string {
  const d = (iso: string) => fmtShortDate(new Date(iso))
  if (plan.state === 'draft') return ''
  if (plan.state === 'active')
    return plan.opened_at ? `depuis le ${d(plan.opened_at)}` : 'en cours'
  if (plan.opened_at && plan.closed_at) {
    const from = d(plan.opened_at)
    const to = d(plan.closed_at)
    return from === to ? to : `${from} → ${to}`
  }
  return plan.closed_at ? d(plan.closed_at) : ''
}

/**
 * Le cycle que la page ouvre quand on ne lui en désigne aucun : le cycle en
 * cours, sinon le dernier prévu, sinon le dernier clos ; aucun → la vue
 * savoir (`null`). Un cycle désigné (arrivée depuis un projet ou une
 * séance) l'emporte s'il existe.
 */
export function pickCycle(
  plans: AcquisitionPlan[],
  wanted: string | null,
): AcquisitionPlan | null {
  if (wanted) return plans.find((p) => p.id === wanted) ?? null
  const last = (state: AcquisitionPlan['state'][]) =>
    plans.filter((p) => state.includes(p.state)).at(-1)
  return (
    last(['active']) ??
    last(['draft']) ??
    last(['completed', 'abandoned']) ??
    null
  )
}

/**
 * La phase où en est le cycle : la première activée qui reste à faire parmi
 * l'acquisition ; tout fait, aucune.
 */
export function currentPhase(phases: PhaseProgress[]): PhaseKey | null {
  return (
    phases.find(
      (p) => p.key !== 'retention' && p.state !== 'off' && p.state !== 'done',
    )?.key ?? null
  )
}
