import type { components } from '@/shared/api'

/** La préparation d'une semaine (#92) : la charnière entre la semaine écoulée
 *  et celle qu'elle prépare, identifiée par le lundi de cette dernière. */
export type WeekPreparation = components['schemas']['WeekPreparationRead']
/** Ce que la préparation montre d'un projet : semaine écoulée (`past`) et
 *  semaine à venir (`next`), sur le périmètre de l'étape en cours (#91). */
export type PreparationProject = components['schemas']['PreparationProjectRead']
/** Un Total sur la semaine écoulée : cible du périmètre, réalisé, gain. */
export type PrepTotal = components['schemas']['PrepTotalRead']
/** Un Résultat sur la semaine écoulée : meilleur relevé compté, écart. */
export type PrepResultPast = components['schemas']['PrepResultPastRead']
/** Un Résultat pour la semaine qui vient : suggestion, cibles posées. */
export type PrepResultNext = components['schemas']['PrepResultNextRead']
/** Un savoir du projet et ce que la semaine lui a apporté. */
export type PrepSkill = components['schemas']['PrepSkillRead']
/** Un objet de pratique qui a bougé dans la semaine. */
export type PrepPracticeItem = components['schemas']['PrepPracticeItemRead']
