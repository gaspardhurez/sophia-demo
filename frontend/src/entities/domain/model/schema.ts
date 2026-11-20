import { z } from 'zod'

import { type DomainColorKey, DOMAIN_COLORS } from './color'
import type { DomainCreate } from './types'

const COLOR_KEYS = DOMAIN_COLORS.map((c) => c.key) as [
  DomainColorKey,
  ...DomainColorKey[],
]

/**
 * Règles de saisie d'un domaine. Partagées par la création et l'édition —
 * elles décrivent ce qu'EST un domaine valide, pas une action utilisateur.
 */
export const domainFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(120),
  emoji: z.string().trim().max(16).optional(),
  color: z.enum(COLOR_KEYS),
  vision: z.string().trim().optional(),
})

export type DomainFormValues = z.infer<typeof domainFormSchema>

/** Un champ laissé vide dans le formulaire vaut `null` côté API, pas `""`. */
export function toDomainPayload(values: DomainFormValues): DomainCreate {
  return {
    name: values.name,
    emoji: values.emoji || null,
    color: values.color,
    vision: values.vision || null,
  }
}
