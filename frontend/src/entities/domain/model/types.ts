import type { components } from '@/shared/api'

/** Un domaine, tel que renvoyé par l'API. Dérivé du contrat OpenAPI. */
export type Domain = components['schemas']['DomainRead']
export type DomainCreate = components['schemas']['DomainCreate']
export type DomainUpdate = components['schemas']['DomainUpdate']
/** Ce qu'une suppression de domaine emporterait, compté (design #51). */
export type DomainUsage = components['schemas']['DomainUsage']
/** Un compteur du domaine : heures (`unit` nul) ou unité déclarée, cumulé
 *  depuis toujours, avec le total de l'année. */
export type DomainCounter = components['schemas']['DomainCounter']
