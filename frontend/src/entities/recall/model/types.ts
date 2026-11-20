import type { components } from '@/shared/api'

/** Une passation de l'interro d'un cycle (#80). Dérivé du contrat. */
export type RecallSession = components['schemas']['RecallSessionRead']
export type RecallSessionSummary = components['schemas']['RecallSessionSummary']
export type RecallAnswer = components['schemas']['RecallAnswerRead']
export type RecallVerdict = components['schemas']['RecallVerdict']
export type RecallAttempt = components['schemas']['RecallAttemptRead']
