import type { components } from '@/shared/api'

/** Une compétence, telle que renvoyée par l'API. Dérivée du contrat OpenAPI. */
export type Skill = components['schemas']['SkillRead']
export type SkillCreate = components['schemas']['SkillCreate']
export type SkillUpdate = components['schemas']['SkillUpdate']
export type SkillStatus = components['schemas']['SkillStatus']

/** Une compétence enrichie de ses enfants — un nœud de l'arbre reconstruit. */
export interface SkillNode extends Skill {
  children: SkillNode[]
}
