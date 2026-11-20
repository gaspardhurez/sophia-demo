import { z } from 'zod'

import type { MetricCreate } from './types'

/**
 * Règles de saisie d'une métrique — partagées création/édition. Décrivent ce
 * qu'EST une métrique valide, pas une action utilisateur.
 */
export const metricFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(80),
  emoji: z.string().trim().max(16).optional(),
  unit_id: z.string().nullable().optional(),
  direction: z.enum(['up', 'down']),
})

export type MetricFormValues = z.infer<typeof metricFormSchema>

/** Un champ vide vaut `null` côté API, pas `""`. */
export function toMetricPayload(values: MetricFormValues): MetricCreate {
  return {
    name: values.name,
    emoji: values.emoji || null,
    unit_id: values.unit_id || null,
    direction: values.direction,
  }
}

/** L'inverse de `toMetricPayload` : une métrique vers les valeurs du formulaire. */
export function metricToFormValues(m: {
  name: string
  emoji: string | null
  unit_id: string | null
  direction: MetricFormValues['direction']
}): MetricFormValues {
  return {
    name: m.name,
    emoji: m.emoji ?? '',
    unit_id: m.unit_id,
    direction: m.direction,
  }
}
