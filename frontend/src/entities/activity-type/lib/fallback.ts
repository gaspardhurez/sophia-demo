import type { ActivityType, Planning } from '../model/types'

/**
 * Le repli du domaine lu comme une planification : éteint, il est Manuelle
 * (rien ne se pose hors projet) ; sinon sa planification.
 */
export function fallbackPlanning(type: ActivityType): Planning {
  return type.fallback_active ? type.fallback_planning : 'manual'
}
