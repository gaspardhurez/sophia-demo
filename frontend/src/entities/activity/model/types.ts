import type { components } from '@/shared/api'

/** Une activité d'exécution, telle que renvoyée par l'API. Dérivé du contrat. */
export type Activity = components['schemas']['ActivityRead']
export type ActivityCreate = components['schemas']['ActivityCreate']
export type ActivityUpdate = components['schemas']['ActivityUpdate']
/** Un acte d'apprentissage contenu dans une activité (#82). */
export type ActivityAct = components['schemas']['ActivityActRead']
export type ActivityActSet = components['schemas']['ActivityActSet']
export type ActKind = ActivityAct['kind']

/** Activité en cours de création, avant enregistrement (double-clic sur le
 *  calendrier, cliquer-glisser). */
export interface Draft {
  start: Date
  end: Date
  allDay?: boolean
  domainId?: string
  stepId?: string
  /** Ce que le brouillon porte déjà, enregistré à sa création — la séance
   *  qu'on crée pendant une liaison (#92) : l'acte, la réalisation ou la
   *  cible qu'on lie. */
  seed?: DraftSeed
}

export interface DraftSeed {
  acts?: ActivityActSet[]
  achievements?: Activity['achievements']
  readings?: { metric_id: string; value: number }[]
}
