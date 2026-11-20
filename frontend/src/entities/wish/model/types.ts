import type { components } from '@/shared/api'

/** Une envie ou un engagement (#215). Dérivé du contrat OpenAPI. */
export type Wish = components['schemas']['WishRead']
export type WishKind = Wish['kind']

/** Une puce telle qu'on l'écrit : l'id est donné ici, le texte peut être
 *  vide le temps de l'écrire (une puce vide ne part pas au serveur). */
export interface WishItem {
  id: string
  text: string
  domain_id: string | null
}
