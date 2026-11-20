import { z } from 'zod'

import type { SkillCreate } from './types'

/**
 * Règles de saisie d'une compétence. Décrit ce qu'EST une compétence valide à
 * la création, pas une action utilisateur.
 */
export const skillFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(120),
  description: z.string().trim().optional(),
})

export type SkillFormValues = z.infer<typeof skillFormSchema>

/**
 * Construit le payload de création. `status` reprend le défaut serveur : le
 * contrat le type comme requis (openapi-typescript), mais sa valeur est bien
 * optionnelle côté métier. `order` n'est pas envoyé : le serveur range le
 * nouveau savoir en dernier parmi ses frères.
 */
export function toSkillPayload(
  values: SkillFormValues,
  parentId: string | null,
): SkillCreate {
  return {
    name: values.name,
    description: values.description || null,
    parent_skill_id: parentId,
    status: 'not_started',
  }
}
