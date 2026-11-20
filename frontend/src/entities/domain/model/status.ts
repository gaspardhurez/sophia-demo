/**
 * Statut d'un domaine — ce que dit la pastille, et ce qu'il implique.
 *
 * Un domaine ne se supprime pas quand on cesse de s'y consacrer : son arbre,
 * ses projets passés et son historique restent. Il se met **en veille**, ce
 * qui le retire de l'accueil et rien d'autre — il reste ouvrable, choisissable
 * dans un sélecteur, et ses activités déjà planifiées restent au calendrier.
 */

import type { Domain } from './types'

export type DomainStatus = Domain['status']

export const DOMAIN_STATUS_META: Record<
  DomainStatus,
  { label: string; dot: string }
> = {
  // La pastille porte seule la distinction : la chip reste au ton neutre, comme
  // toutes celles qui accompagnent un titre sans lui voler le regard.
  active: { label: 'Actif', dot: 'bg-emerald-500' },
  paused: { label: 'En veille', dot: 'bg-amber-500' },
}

/** Ordre d'affichage : ce qu'on poursuit d'abord, ce qui dort ensuite. */
export const DOMAIN_STATUSES: DomainStatus[] = ['active', 'paused']

export function isDomainActive(domain: Domain): boolean {
  return domain.status === 'active'
}
