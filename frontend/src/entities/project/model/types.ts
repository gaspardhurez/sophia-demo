import type { components } from '@/shared/api'

/** Un projet, tel que renvoyé par l'API. Dérivé du contrat OpenAPI. */
export type Project = components['schemas']['ProjectRead']
export type ProjectCreate = components['schemas']['ProjectCreate']
export type ProjectUpdate = components['schemas']['ProjectUpdate']
/** Ce qui lie un projet à un de ses domaines (#203) : ce qu'il perd quand
 *  ce domaine le quitte. */
export type ProjectDomainTies = components['schemas']['ProjectDomainTies']
export type ProjectStatus = components['schemas']['ProjectStatus']
export type ProjectStep = components['schemas']['ProjectStepRead']
export type ProjectStepCreate = components['schemas']['ProjectStepCreate']
export type ProjectStepUpdate = components['schemas']['ProjectStepUpdate']
/** Un compteur du projet (#194) : celui du domaine, restreint aux activités
 *  liées, hors ce qu'un Total du projet compte déjà. */
export type ProjectCounter = components['schemas']['DomainCounter']

/**
 * Un **Total** : une cible sur ce que comptent les activités du projet —
 * une valeur déclarée, une durée lue au calendrier, ou un nombre de fois.
 * Réunit les anciens Volume et Régularité (24/09/2026).
 */
export type Total = components['schemas']['TotalRead']
export type TotalMode = components['schemas']['TotalMode']
export type TotalCreate = components['schemas']['TotalCreate']
export type TotalUpdate = components['schemas']['TotalUpdate']
/** La tranche d'un Total confiée à une étape. */
export type StepTotal = components['schemas']['StepTotalRead']

/**
 * Une **Réalisation** : l'axe qualitatif du tracking — « je l'ai fait ».
 *
 * Elle appartient au projet et meurt avec lui, contrairement à une
 * métrique qui vit au niveau du domaine et traverse les projets.
 */
export type Achievement = components['schemas']['AchievementRead']
export type AchievementCreate = components['schemas']['AchievementCreate']
export type AchievementUpdate = components['schemas']['AchievementUpdate']
