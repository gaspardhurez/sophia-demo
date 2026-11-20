import type { components } from '@/shared/api'

/** Un lien activité → projet, avec son étape (#37 : zéro, un ou plusieurs). */
export type ActivityLink = components['schemas']['ActivityProjectRead']

/** L'activité compte-t-elle pour ce projet ? */
export function countsFor(
  activity: { projects: ActivityLink[] },
  projectId: string | undefined,
): boolean {
  return activity.projects.some((link) => link.project_id === projectId)
}

/** Les liens à renvoyer tels quels (duplicata, annulation d'une suppression). */
export function linksOf(activity: {
  projects: ActivityLink[]
}): ActivityLink[] {
  return activity.projects.map(({ project_id, step_id }) => ({
    project_id,
    step_id,
  }))
}
