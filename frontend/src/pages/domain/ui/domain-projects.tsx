import { useNavigate } from 'react-router-dom'

import { type Domain, useDomains } from '@/entities/domain'
import { isProjectOpen, type Project } from '@/entities/project'
import { ProjectCard } from '@/widgets/project/card'
import { ItemCard, SectionTitle, SkeletonRegion } from '@/shared/ui'

/**
 * Les projets du domaine (design #51) : par défaut ceux qui tournent — en
 * cours, puis à venir par date de début ; une barre choisie sur la frise ne
 * laisse que son projet, clos compris. « + » ouvre la création.
 */
export function DomainProjects({
  domain,
  projects,
  selectedId,
}: {
  domain: Domain
  projects: Project[] | undefined
  selectedId: string | null
}) {
  const navigate = useNavigate()
  const { data: domains } = useDomains()
  // Ses autres domaines (#203) : le projet se lit ici dans la couleur du
  // domaine affiché, les autres en étiquettes grises.
  const alsoIn = (o: Project) =>
    o.domain_ids.flatMap((id) =>
      id === domain.id ? [] : (domains?.find((d) => d.id === id) ?? []),
    )
  const selected = projects?.find((o) => o.id === selectedId)
  const shown = selected
    ? [selected]
    : (projects ?? [])
        .filter((o) => isProjectOpen(o.status))
        .sort(
          (a, b) =>
            Number(b.status === 'in_progress') -
              Number(a.status === 'in_progress') ||
            (a.start_at ?? '').localeCompare(b.start_at ?? ''),
        )

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <SectionTitle
        as="h3"
        className="mb-0"
        onAdd={() => navigate(`/projects/new?domain=${domain.id}`)}
        addLabel="Nouveau projet"
      >
        Projets
      </SectionTitle>

      {!projects && (
        <SkeletonRegion className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <ProjectCard.Skeleton key={i} />
          ))}
        </SkeletonRegion>
      )}

      {projects && shown.length === 0 && (
        <ItemCard.Empty>Aucun projet en cours ni à venir</ItemCard.Empty>
      )}

      {shown.length > 0 && (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {shown.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              domain={domain}
              also={alsoIn(project)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
