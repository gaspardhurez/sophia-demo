import { useState } from 'react'

import {
  type AcquisitionPlan,
  type PlanUpdate,
  useUpdatePlan,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

/**
 * Le brouillon du plan pendant qu'on l'ajuste.
 *
 * **Ce qui se met en brouillon, c'est le plan — pas les objets.** Activer une
 * phase, changer le niveau visé ou le rythme de rétention sont des réglages
 * d'un même objet : ils attendent « Enregistrer », et « Annuler » les jette.
 * Ajouter un exercice ou le supprimer, non : ce sont des entités à part, leur
 * geste est immédiat, et le catalogue appartient au savoir plutôt qu'au cycle.
 */
export function usePlanDraft(plan: AcquisitionPlan | undefined) {
  const [draft, setDraft] = useState<PlanUpdate>({})
  const update = useUpdatePlan()

  function value<K extends keyof AcquisitionPlan>(
    key: K,
  ): AcquisitionPlan[K] | undefined {
    const pending = (draft as Record<string, unknown>)[key as string]
    return pending !== undefined ? (pending as AcquisitionPlan[K]) : plan?.[key]
  }

  return {
    /** La valeur en cours d'édition, brouillon d'abord, plan ensuite. */
    value,
    patch: (body: PlanUpdate) => setDraft((d) => ({ ...d, ...body })),
    dirty: Object.keys(draft).length > 0,
    saving: update.isPending,
    reset: () => setDraft({}),
    async save() {
      if (!plan || Object.keys(draft).length === 0) return true
      try {
        // Un niveau visé ou un nom vidé n'est pas une valeur : il s'enregistre
        // `null`, sinon le brouillon passerait pour cadré et l'onglet
        // afficherait un nom vide au lieu du nom de repli.
        const body = { ...draft }
        for (const key of ['target_level', 'name'] as const)
          if (typeof body[key] === 'string' && !body[key].trim())
            body[key] = null
        await update.mutateAsync({ id: plan.id, body })
        setDraft({})
        return true
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "L'enregistrement a échoué",
        )
        return false
      }
    },
  }
}

export type PlanDraft = ReturnType<typeof usePlanDraft>
