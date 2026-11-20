import type { components } from '@/shared/api'

/**
 * Ce que Sophia peut faire en ce moment (`GET /companion`) : la dictée, la
 * vérification des notes, les idées centrales, la réponse dans un fil —
 * chacune `{ available, reason }`. Dérivé du contrat.
 */
export type CompanionStatus = components['schemas']['CompanionStatus']
/** Une action du compagnon : disponible, ou pas, avec son motif en français
 *  (`reason`, nul si disponible) — ce que l'écran met en infobulle. */
export type ActionStatus = components['schemas']['ActionStatus']
/** Ce que rend une dictée : des puces nettoyées, vides si rien entendu. */
export type Dictation = components['schemas']['DictationRead']
/**
 * Une idée centrale d'une section des notes (`POST
 * /skills/{id}/central-ideas`, #173) : l'idée (`idea`), pourquoi elle compte
 * (`reason`, quelques mots), par où l'interroger (`angle`) et l'extrait de la
 * section où elle se lit (`quote`, tel qu'il figure dans un seul bloc ; nul
 * sinon). Jamais une question rédigée : c'est l'utilisateur qui l'écrit.
 */
export type CentralIdea = components['schemas']['CentralIdeaRead']
