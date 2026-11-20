import type { ActivityType, ActivityTypeLink } from '@/entities/activity-type'
import { isProjectOpen, type Project } from '@/entities/project'

/**
 * Les activités types du domaine rangées pour la page domaine : un groupe
 * par projet **ouvert** (en cours, à venir) qui en porte au moins une — ses
 * liens vers les activités types de ce domaine, dans l'ordre du projet —,
 * puis celles qu'aucun projet ouvert ne porte (`outside`). Seules ces
 * dernières peuvent être posées par le repli : un projet ouvert qui porte
 * l'activité type l'emporte, quelle que soit sa planification (cf.
 * `activites.md`, *Le repli du domaine*). Un projet clos ne porte plus rien.
 */
export function groupByProject(
  types: ActivityType[],
  projects: Project[],
): {
  groups: { project: Project; links: ActivityTypeLink[] }[]
  outside: ActivityType[]
} {
  const ids = new Set(types.map((t) => t.id))
  const groups = projects
    .filter((p) => isProjectOpen(p.status))
    .map((project) => ({
      project,
      links: project.activity_types.filter((l) => ids.has(l.activity_type_id)),
    }))
    .filter((g) => g.links.length > 0)
  const carried = new Set(
    groups.flatMap((g) => g.links.map((l) => l.activity_type_id)),
  )
  return { groups, outside: types.filter((t) => !carried.has(t.id)) }
}
