import type { components } from '@/shared/api'

/** Une activité type (#37) : ce qu'on fait, au niveau du domaine. */
export type ActivityType = components['schemas']['ActivityTypeRead']
export type ActivityTypeCreate = components['schemas']['ActivityTypeCreate']
export type ActivityTypeUpdate = components['schemas']['ActivityTypeUpdate']

/** Quotidienne · Hebdomadaire · Manuelle. */
export type Planning = components['schemas']['Planning']

/** Une activité type planifiée pour un projet, telle que le projet la lit. */
export type ActivityTypeLink = components['schemas']['LinkRead']
export type ActivityTypeLinkSet = components['schemas']['LinkSet']

/** Jusqu'où le calendrier est posé. */
export type PlanningLevel = components['schemas']['PlanningLevel']

/** Une occurrence que la planification poserait, pas encore posée. */
export type Ghost = components['schemas']['GhostRead']
