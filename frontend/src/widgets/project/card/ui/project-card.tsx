import { Link } from 'react-router-dom'

import { domainColorValues } from '@/entities/domain'
import { useProjectMetrics } from '@/entities/metric'
import {
  currentStep,
  isProjectOpen,
  type Project,
  ProjectStateChip,
  projectEmoji,
} from '@/entities/project'
import { ProjectTrackingRow, trackingChips } from '@/features/project/tracking'
import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'
import { Skeleton } from '@/shared/ui'

interface ProjectCardProps {
  project: Project
  /** Domaine porteur (emoji + couleur) : la teinte de la carte. */
  domain?: { emoji: string | null; color: string | null }
  /** Ses autres domaines (#203) : une étiquette grise chacun, deux au plus. */
  also?: { emoji: string | null; name: string }[]
}

/**
 * La carte d'un projet, à l'accueil et sur la page domaine (#210,
 * `kit/Carte projet`). En tête l'emoji, le titre, les autres domaines en gris
 * et l'état ; dessous l'étape en cours, sinon la période ; en pied, les chips
 * de l'en-tête du projet en lecture seule — ses compteurs, puis une chip par
 * objectif (`ProjectTrackingRow`).
 *
 * Les chips tiennent sur **une ligne** : ce qui ne tient pas se compte en
 * « +n ». Au survol, la carte grandit en douceur et les montre toutes ; elle
 * pousse ce qui suit sans rien recouvrir (la grille aligne en haut, seule
 * elle grandit). Un clic ouvre le projet.
 */
export function ProjectCard({ project, domain, also = [] }: ProjectCardProps) {
  const today = toDateISO(new Date())
  // Le même cache que la ligne de chips : pas de requête de plus.
  const { data: results } = useProjectMetrics(project.id)

  const step = isProjectOpen(project.status)
    ? currentStep(project, today)
    : null
  const subtitle = step?.title ?? projectPeriod(project)
  const chips = trackingChips(project, results ?? [])
  const ink = domainColorValues(domain?.color).ink
  const emoji = projectEmoji(project, domain?.emoji)

  return (
    <Link
      to={`/projects/${project.id}`}
      // Ouverte (des chips débordaient), une ombre légère la marque.
      className="group/card flex min-h-24 min-w-0 flex-col rounded-[10px] border bg-card p-3 shadow-xs transition-[box-shadow,border-color] duration-300 hover:border-ring hover:has-[[data-overflow]]:shadow-[0_6px_18px_oklch(0.21_0.008_285/0.10)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm leading-tight font-medium">
          {emoji && (
            <span aria-hidden className="mr-1 text-[13px]">
              {emoji}
            </span>
          )}
          {project.title}
        </span>
        <AlsoIn domains={also} />
        {/* Sans objectif, rien ne cadence : pas de point de rythme. */}
        {!(chips.length === 0 && project.status === 'in_progress') && (
          <ProjectStateChip
            project={project}
            today={today}
            showStart
            week
            ink={ink}
          />
        )}
      </div>
      {subtitle && (
        <span className="mt-0.5 truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      )}
      <ProjectTrackingRow
        project={project}
        colorKey={domain?.color}
        className="mt-auto pt-3"
        empty={
          <span className="mt-auto pt-3 text-xs leading-[22px] text-muted-foreground/75">
            Rien de compté pour l’instant
          </span>
        }
      />
    </Link>
  )
}

/** « 21 sept. → 31 déc. », « Depuis le 20 sept. » : le sous-titre d'un
 *  projet sans étape en cours. */
function projectPeriod(project: Project): string | null {
  const start = project.start_at
  const due = project.due_at ?? project.ended_at
  if (start && due) return `${formatDateShort(start)} → ${formatDateShort(due)}`
  if (start) return `Depuis le ${formatDateShort(start)}`
  if (due) return `→ ${formatDateShort(due)}`
  return null
}

/** « Aussi dans … » : deux étiquettes au plus, puis « +n ». */
function AlsoIn({
  domains,
}: {
  domains: { emoji: string | null; name: string }[]
}) {
  if (domains.length === 0) return null
  const label = (d: { emoji: string | null; name: string }) =>
    `${d.emoji ?? ''} ${d.name}`.trim()
  const rest = domains.slice(2)
  const tag =
    'inline-flex h-5 shrink-0 items-center rounded-[4px] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground'
  return (
    <>
      {domains.slice(0, 2).map((d) => (
        <span key={d.name} title={`Aussi dans ${label(d)}`} className={tag}>
          {label(d)}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          title={`Aussi dans ${rest.map(label).join(', ')}`}
          className={tag}
        >
          +{rest.length}
        </span>
      )}
    </>
  )
}

/** Même gabarit que la carte : titre, sous-titre, une ligne de chips. */
ProjectCard.Skeleton = function ProjectCardSkeleton() {
  return (
    <div className="flex min-h-24 flex-col rounded-[10px] border bg-card p-3 shadow-xs">
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="mt-1.5 h-3 w-1/2" />
      <div className="mt-auto flex gap-1.5 pt-3">
        <Skeleton className="h-[22px] w-20 rounded-md" />
        <Skeleton className="h-[22px] w-24 rounded-md" />
      </div>
    </div>
  )
}
