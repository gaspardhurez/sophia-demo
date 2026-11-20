import {
  type Activity,
  copyOf,
  useCreateActivity,
  useLinkActivityAchievement,
} from '@/entities/activity'
import { type MetricValue, useAddMetricValue } from '@/entities/metric'

/**
 * Recréer une séance supprimée, à l'identique — l'annulation d'une
 * suppression : l'intention (comme un duplicata), son vécu (coche, notes),
 * ses relevés (le CASCADE les avait emportés) et les réalisations qu'elle
 * préparait. Nouvel identifiant.
 */
export function useRestoreActivity() {
  const create = useCreateActivity()
  const addValue = useAddMetricValue()
  const link = useLinkActivityAchievement()
  return async (a: Activity, values: MetricValue[]) => {
    const created = await create.mutateAsync({
      ...copyOf(a, {
        all_day: a.all_day,
        start_at: a.start_at,
        end_at: a.end_at,
      }),
      done: a.done,
      notes: a.notes,
    })
    for (const v of values)
      await addValue.mutateAsync({
        metricId: v.metric_id,
        value: v.value,
        measuredAt: v.measured_at,
        activityId: created.id,
      })
    for (const r of a.achievements)
      await link.mutateAsync({ id: created.id, achievementId: r.id })
    return created
  }
}
