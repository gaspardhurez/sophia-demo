import { useAddPlanItem } from '@/entities/plan'
import { useCreatePracticeItem } from '@/entities/practice'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import type { PickNature } from './pick'

/**
 * Composer une rampe (design #63, `kit/Chercher ou creer`) : piocher un objet
 * de la bibliothèque, ou en créer un — il entre dans la bibliothèque et, s'il
 * y a un cycle, en fin de sa rampe. Sans cycle (vue savoir), on **repère** :
 * l'objet ne va qu'à la bibliothèque.
 *
 * Immédiat, comme tout ce qui touche aux objets : seul le réglage du cycle
 * (phases, niveau, projets) attend « Enregistrer ».
 */
export function useComposeRamp(skillId: string, planId?: string) {
  const add = useAddPlanItem()
  const create = useCreatePracticeItem()

  const fail = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback)

  return {
    async pick(itemId: string) {
      if (!planId) return
      try {
        await add.mutateAsync({ planId, itemId })
      } catch (err) {
        fail(err, "L'ajout a échoué")
      }
    },
    async create(title: string, nature: PickNature) {
      try {
        await create.mutateAsync({
          skillId,
          body: {
            title,
            nature: nature === 'app' ? 'situation' : 'isolated',
            kind: nature === 'int' ? 'integrated' : 'manual',
            eval_mode: 'self',
            plan_id: planId ?? null,
          },
        })
      } catch (err) {
        fail(err, 'La création a échoué')
      }
    },
  }
}
