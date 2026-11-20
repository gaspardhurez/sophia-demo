import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'

/**
 * La courbe de l'interro d'un cycle — même règle que le back
 * (`domain/recall.py`) : J+1, J+7, J+15, J+30, J+90, puis J+90.
 */
export const RECALL_INTERVALS = [1, 7, 15, 30, 90] as const

/** « J+15 » : l'intervalle du rang donné. */
export function recallStep(stage: number): string {
  const i = Math.min(Math.max(stage, 0), RECALL_INTERVALS.length - 1)
  return `J+${RECALL_INTERVALS[i]}`
}

/**
 * La date du prochain rappel, telle que la carte Interro la dit : « Dû »
 * (aujourd'hui ou passée), « demain », sinon la date courte (« 15 oct. »).
 */
export function recallDueLabel(due: string, today: string): string {
  if (due <= today) return 'Dû'
  const tomorrow = new Date(`${today}T00:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return due === toDateISO(tomorrow) ? 'demain' : formatDateShort(due)
}
