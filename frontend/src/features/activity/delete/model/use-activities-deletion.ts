import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { type Activity, useDeleteActivities } from '@/entities/activity'
import { activityMetricValuesQuery } from '@/entities/metric'

import { carries, type PendingDeletion } from './use-activity-deletion'

/**
 * Supprimer **une sélection** (calendrier, sélection multiple), toutes ou
 * aucune, avec la règle d'une seule séance (`useActivityDeletion`) : sans
 * question si aucune ne porte rien, sinon **une** confirmation qui énumère,
 * séance par séance, ce qui part.
 */
export function useActivitiesDeletion(options?: {
  /** Appelé après la suppression, avec ce qu'elle a emporté (pour un undo). */
  onDeleted?: (deleted: PendingDeletion[]) => void
  onError?: (err: unknown) => void
}) {
  const queryClient = useQueryClient()
  const remove = useDeleteActivities()
  const [pending, setPending] = useState<PendingDeletion[] | null>(null)

  async function erase(items: PendingDeletion[]) {
    setPending(null)
    try {
      await remove.mutateAsync({ ids: items.map((x) => x.activity.id) })
      options?.onDeleted?.(items)
    } catch (err) {
      options?.onError?.(err)
    }
  }

  /** Point d'entrée : demande la suppression, qui s'exécute ou se fait confirmer. */
  async function request(activities: Activity[]) {
    let items: PendingDeletion[]
    try {
      // Les relevés de chacune, lus au serveur (cf. `useActivityDeletion`).
      items = await Promise.all(
        activities.map(async (activity) => ({
          activity,
          values: await queryClient.fetchQuery(
            activityMetricValuesQuery(activity.id),
          ),
        })),
      )
    } catch {
      // Relevés illisibles : on demande plutôt que de supprimer à l'aveugle.
      setPending(activities.map((activity) => ({ activity, values: [] })))
      return
    }
    if (!items.some((x) => carries(x.activity, x.values))) {
      await erase(items)
      return
    }
    setPending(items)
  }

  return {
    request,
    pending,
    confirm: () => pending && erase(pending),
    cancel: () => setPending(null),
    isPending: remove.isPending,
  }
}
