import type { Activity } from '@/entities/activity'
import { type AcquisitionPlan, pieceKey } from '@/entities/plan'

/**
 * Le dernier niveau sur 5 de chaque pièce d'un cycle (#139, chip des tuiles) :
 * le retour de sa passe faite la plus tardive qui en porte un, par
 * `pieceKey`. Les séances du cycle, et celles du savoir sans cycle.
 */
export function lastLevels(
  activities: Activity[],
  plan: AcquisitionPlan,
): Map<string, number> {
  const latest = new Map<string, { at: string; level: number }>()
  for (const a of activities) {
    if (!a.done || !a.start_at) continue
    for (const act of a.acts) {
      if (act.level == null || act.skill_id !== plan.skill_id) continue
      if (act.plan_id != null && act.plan_id !== plan.id) continue
      // La pièce d'un objet ne porte pas de nature (`piecesOf`) ; l'acte, si.
      const key = pieceKey(
        act.practice_item_id ? { ...act, nature: null } : act,
      )
      const seen = latest.get(key)
      if (!seen || seen.at < a.start_at)
        latest.set(key, { at: a.start_at, level: act.level })
    }
  }
  return new Map([...latest].map(([k, v]) => [k, v.level]))
}
