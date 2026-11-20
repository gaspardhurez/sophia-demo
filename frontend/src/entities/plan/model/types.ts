import type { components } from '@/shared/api'

/** Un cycle d'acquisition sur un savoir. Dérivé du contrat OpenAPI. */
export type AcquisitionPlan = components['schemas']['PlanRead']
export type PlanCreate = components['schemas']['PlanCreate']
export type PlanUpdate = components['schemas']['PlanUpdate']
export type PlanItemUpdate = components['schemas']['PlanItemUpdate']
/** Une ressource étudiée par un cycle : sa place dans l'ordre de consommation,
 *  sa case « consommée » (#173). */
export type PlanResource = components['schemas']['PlanResourceRead']
export type PlanState = components['schemas']['PlanState']

/** « Cadrer l'étude » (#175) : un échange du chat de l'intention — la
 *  question de Sophia, la réponse envoyée. */
export type IntentionExchange = components['schemas']['IntentionExchange']
/** Le tour suivant du chat : la question (nulle quand c'est fini), les
 *  réponses proposées, l'intention reformulée, et si Sophia a fini. */
export type IntentionReply = components['schemas']['IntentionReply']
/** Une partie possible du savoir, proposée dans ou hors de ce cycle. */
export type ScopeTagProposal = components['schemas']['ScopeTagRead']
/** Une ressource trouvée par la recherche web de Sophia. */
export type ResourceProposal = components['schemas']['ResourceProposalRead']
