import { useMetrics } from '@/entities/metric'
import { unitLabel } from '@/shared/lib/units'

import type { PendingDeletion } from '../model/use-activity-deletion'

/**
 * Ce qu'une séance emporte en partant, **énuméré** : ses valeurs déclarées,
 * puis ses relevés qui comptent (« Squat 90 kg » dit si un record part, « 2
 * relevés » ne le dit pas). Une cible n'a rien mesuré : elle ne s'annonce pas.
 */
export function DeletionLines({ pending }: { pending: PendingDeletion }) {
  // Les relevés ne portent que `metric_id` : les noms et unités viennent du
  // catalogue du domaine de la séance.
  const { data: metrics } = useMetrics(pending.activity.domain_id)
  const byId = new Map((metrics ?? []).map((m) => [m.id, m]))
  const values = pending.values.filter((v) => v.counts)

  return (
    <ul className="grid gap-1.5 text-sm">
      {pending.activity.values.map((v) => (
        <li key={v.unit_id} className="flex items-center gap-2">
          <span className="tabular-nums">
            {v.value} {unitLabel(v.unit, v.value)}
          </span>
          <span className="text-muted-foreground">
            — valeur déclarée, retirée des Totaux du projet
          </span>
        </li>
      ))}
      {values.map((v) => {
        const metric = byId.get(v.metric_id)
        return (
          <li key={v.id} className="flex items-center gap-2">
            <span className="font-medium tabular-nums">
              {v.value} {unitLabel(metric?.unit, v.value)}
            </span>
            <span className="min-w-0 truncate text-muted-foreground">
              — relevé de {metric?.name ?? 'métrique'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Le rappel sous la liste, quand des relevés partent. */
export function MeasuresLostNote({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <p className="text-xs text-muted-foreground">
      {count > 1
        ? 'Ces relevés ne sont conservés nulle part ailleurs'
        : 'Ce relevé n’est conservé nulle part ailleurs'}{' '}
      : s’ils comptent hors de cette séance, note-les d’abord dans la métrique,
      depuis la page du domaine.
    </p>
  )
}
