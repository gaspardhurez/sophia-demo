import {
  type ActivityType,
  type ActivityTypeLinkSet,
  useDeleteActivityType,
  useRemoveProjectActivityType,
  useSetProjectActivityType,
} from '@/entities/activity-type'

import type { RemoveChoice } from '../ui/remove-link-dialog'

/** Ce que l'éditeur demande à son appelant. */
export interface LinkHandlers {
  /** Planifie une activité type pour le projet (lien neuf). */
  onAdd: (activityType: ActivityType) => Promise<void>
  onChange: (
    activityTypeId: string,
    body: ActivityTypeLinkSet,
    reset: boolean,
  ) => Promise<void>
  onRemove: (activityTypeId: string, choice: RemoveChoice) => Promise<void>
}

/** Planification d'un lien neuf : Manuelle, rien ne se pose (12/11 ; c'était
 *  Hebdomadaire, L M V). Passer en Hebdomadaire propose L M V. */
export const NEW_LINK: ActivityTypeLinkSet = {
  planning: 'manual',
  weekdays: [],
  slot_start: null,
  slot_minutes: null,
  preserve_after: false,
  off_step_ids: [],
}

/** L'éditeur branché sur la base : la page projet, et le formulaire une
 *  fois le projet créé. */
export function useServerLinkHandlers(projectId: string): LinkHandlers {
  const setLink = useSetProjectActivityType()
  const removeLink = useRemoveProjectActivityType()
  const destroy = useDeleteActivityType()
  return {
    onAdd: (activityType) =>
      setLink.mutateAsync({
        projectId,
        activityTypeId: activityType.id,
        body: NEW_LINK,
      }),
    onChange: (activityTypeId, body, reset) =>
      setLink.mutateAsync({ projectId, activityTypeId, body, reset }),
    onRemove: async (activityTypeId, choice) => {
      if (choice === 'delete') await destroy.mutateAsync(activityTypeId)
      else
        await removeLink.mutateAsync({
          projectId,
          activityTypeId,
          thenDomain: choice === 'domain',
        })
    },
  }
}
