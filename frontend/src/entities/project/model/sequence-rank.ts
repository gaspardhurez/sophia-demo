import type { Project } from './types'

/**
 * Le rang d'un savoir dans la séquence des projets d'une séance : celle du
 * premier projet, puis du suivant… Un savoir hors séquence vient après,
 * dans l'ordre qu'on lui donnait. C'est l'ordre de la section Apprentissage
 * du panneau ; les aperçus des actes (`actLines`) le suivent.
 */
export function sequenceRank(
  projects: Project[] | undefined,
  projectIds: string[],
): (skillId: string) => number {
  const rank = new Map<string, number>()
  for (const id of projectIds)
    for (const s of projects?.find((o) => o.id === id)?.learning ?? [])
      if (!rank.has(s.skill_id)) rank.set(s.skill_id, rank.size)
  return (skillId) => rank.get(skillId) ?? Number.MAX_SAFE_INTEGER
}
