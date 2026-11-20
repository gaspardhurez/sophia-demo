import { useMemo } from 'react'

import { type Domain, domainColorValues } from '@/entities/domain'
import {
  compareByUrgency,
  type Project,
  principalDomainId,
} from '@/entities/project'
import { SkillPill, useAllSkills } from '@/entities/skill'
import { ProjectCard } from '@/widgets/project/card'
import { toDateISO } from '@/shared/lib/date'
import { ItemCard, SectionTitle, SkeletonRegion } from '@/shared/ui'

import { HomeSection } from './home-section'

/**
 * « En ce moment » (design #52) : les projets en cours, du plus en retard
 * au plus en avance, puis les savoirs en cours de tous les domaines, en
 * pastilles. Un clic sur une pastille ouvre le savoir dans le panneau de la
 * page, comme sur la page domaine.
 */
export function NowSection({
  projects,
  domains,
  keep,
  onOpenSkill,
}: {
  projects: Project[] | undefined
  domains: Domain[]
  keep: (domainId: string) => boolean
  onOpenSkill: (skillId: string) => void
}) {
  const { data: skills } = useAllSkills()
  const domainById = useMemo(
    () => new Map(domains.map((d) => [d.id, d])),
    [domains],
  )

  const current = useMemo(
    () =>
      (projects ?? [])
        .filter((o) => o.status === 'in_progress' && o.domain_ids.some(keep))
        .sort(compareByUrgency(toDateISO(new Date()))),
    [projects, keep],
  )
  // Par domaine (dans l'ordre de la liste des domaines), puis dans l'ordre de
  // l'arbre : deux savoirs du même domaine restent voisins.
  const learning = useMemo(() => {
    const rank = new Map(domains.map((d, i) => [d.id, i]))
    return (skills ?? [])
      .filter((s) => s.status === 'in_progress' && keep(s.domain_id))
      .sort(
        (a, b) =>
          (rank.get(a.domain_id) ?? 0) - (rank.get(b.domain_id) ?? 0) ||
          a.order - b.order,
      )
  }, [skills, domains, keep])

  const meta = projects
    ? `${current.length} projet${current.length > 1 ? 's' : ''} · ${
        learning.length
      } savoir${learning.length > 1 ? 's' : ''}`
    : undefined

  return (
    <HomeSection title="En ce moment" meta={meta}>
      {!projects && (
        <SkeletonRegion className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ProjectCard.Skeleton key={i} />
          ))}
        </SkeletonRegion>
      )}
      {projects && current.length === 0 && (
        <ItemCard.Empty>Aucun projet en cours</ItemCard.Empty>
      )}
      {current.length > 0 && (
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {current.map((o) => (
            <ProjectCard
              key={o.id}
              project={o}
              domain={domainById.get(principalDomainId(o))}
              // Ses autres domaines (#203), en gris après le titre.
              also={o.domain_ids.flatMap((id) =>
                id === principalDomainId(o) ? [] : (domainById.get(id) ?? []),
              )}
            />
          ))}
        </div>
      )}

      {learning.length > 0 && (
        <>
          <SectionTitle as="h3" className="mt-2 mb-0">
            Savoirs en cours
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {learning.map((s) => {
              const domain = domainById.get(s.domain_id)
              return (
                <SkillPill
                  key={s.id}
                  skill={s}
                  emoji={domain?.emoji}
                  colors={domainColorValues(domain?.color ?? null)}
                  onClick={() => onOpenSkill(s.id)}
                />
              )
            })}
          </div>
        </>
      )}
    </HomeSection>
  )
}
