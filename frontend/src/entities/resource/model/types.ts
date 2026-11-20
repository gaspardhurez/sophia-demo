import type { components } from '@/shared/api'

/** Une ressource d'un savoir — de quoi étudier. Dérivé du contrat. */
export type Resource = components['schemas']['ResourceRead']
export type ResourceCreate = components['schemas']['ResourceCreate']
export type ResourceUpdate = components['schemas']['ResourceUpdate']
/** Les notes libres d'une ressource (#173) : un document TipTap, nul tant
 *  qu'il n'a jamais été écrit. */
export type ResourceNotes = components['schemas']['ResourceNotesRead']
