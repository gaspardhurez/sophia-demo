import type { Project, ProjectDomainTies } from './types'

/**
 * Les domaines d'un projet (#203) : `domain_ids`, dans l'ordre. Le premier
 * est le **principal** — la couleur, l'emoji et le lien du projet ; le projet
 * part avec lui. Les suivants sont secondaires.
 */
export const principalDomainId = (project: Pick<Project, 'domain_ids'>) =>
  project.domain_ids[0]

/** Le projet est-il dans ce domaine, principal ou secondaire ? */
export const inDomain = (
  project: Pick<Project, 'domain_ids'>,
  domainId: string | null | undefined,
) => domainId != null && project.domain_ids.includes(domainId)

/**
 * Ce qu'un projet perd quand un domaine le quitte, en morceaux de phrase :
 * « 2 savoirs visés », « 1 activité type »… Vide : rien ne se délie.
 */
export function describeTies(ties: ProjectDomainTies): string[] {
  const n = (count: number, one: string, many: string) =>
    count > 0 ? [`${count} ${count > 1 ? many : one}`] : []
  return [
    ...n(ties.skills.length, 'savoir visé', 'savoirs visés'),
    ...n(ties.activity_types.length, 'activité type', 'activités types'),
    ...n(ties.results.length, 'Résultat', 'Résultats'),
    ...n(ties.activities, 'activité liée', 'activités liées'),
  ]
}

/** L'emoji d'un projet : le sien, sinon celui de son domaine principal. */
export const projectEmoji = (
  project: Pick<Project, 'emoji'>,
  domainEmoji: string | null | undefined,
) => project.emoji || domainEmoji || null
