import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import {
  buildFrise,
  type Project,
  SeasonMonths,
  SeasonTrack,
  inDomain,
} from '@/entities/project'
import { cn } from '@/shared/lib/utils'

import { HomeSection } from './home-section'

/**
 * « Cette année » (design #52) : la frise de la page domaine, une rangée par
 * domaine actif — le nom de la rangée mène au domaine. Un projet dans
 * plusieurs domaines (#203) a une barre dans la rangée de chacun, à sa
 * couleur ; le survol de l'une allume les autres. Un clic sur une saison
 * ouvre le projet (#206 ; la page domaine, elle, filtre ses cartes).
 *
 * Les domaines en veille n'y sont pas : la frise dit ce qu'on poursuit. Un
 * domaine sans projet dans l'année non plus : sa rangée serait vide. Le
 * chevron, au survol de la section, passe d'une année à l'autre.
 */
export function YearSection({
  domains,
  projects,
}: {
  /** Les rangées : domaines actifs, filtre appliqué. */
  domains: Domain[]
  projects: Project[]
}) {
  const navigate = useNavigate()
  // Un projet dans plusieurs domaines a une barre dans chacune de leurs
  // rangées (#203) : en survoler une les allume toutes.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [year, setYear] = useState(() => new Date().getFullYear())

  const rows = useMemo(
    () =>
      domains
        .map((d) => ({
          domain: d,
          frise: buildFrise(
            projects.filter((o) => inDomain(o, d.id)),
            new Date(),
            year,
          ),
        }))
        .filter(({ frise }) => frise.bars.length > 0),
    [domains, projects, year],
  )
  // Les mois ne dépendent que de l'année.
  const months = useMemo(() => buildFrise([], new Date(), year), [year])

  return (
    <HomeSection
      title="Cette année"
      meta={
        <span className="flex items-center gap-0.5">
          <YearStep
            label="Année précédente"
            icon={ChevronLeft}
            onClick={() => setYear((y) => y - 1)}
          />
          <span className="tabular-nums">{year}</span>
          <YearStep
            label="Année suivante"
            icon={ChevronRight}
            onClick={() => setYear((y) => y + 1)}
          />
        </span>
      }
    >
      <div className="flex flex-col gap-1 rounded-xl border bg-card px-3.5 pt-3 pb-2">
        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
          <span />
          <SeasonMonths frise={months} />
        </div>
        {rows.map(({ domain, frise }) => (
          <div
            key={domain.id}
            className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3 py-1"
          >
            <Link
              to={`/domains/${domain.id}`}
              className="flex min-w-0 items-center gap-2 hover:text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-[22px] shrink-0 place-items-center rounded-md border text-xs',
                  domainColor(domain.color).soft,
                )}
              >
                {domain.emoji}
              </span>
              <span className="truncate text-xs font-semibold">
                {domain.name}
              </span>
            </Link>
            <SeasonTrack
              frise={frise}
              colors={domainColorValues(domain.color)}
              textClassName={domainColor(domain.color).text}
              selectedId={null}
              onSelect={(id) => id && navigate(`/projects/${id}`)}
              hoveredId={hoveredId}
              onHover={setHoveredId}
            />
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Aucun projet en {year}.
          </p>
        )}
      </div>
    </HomeSection>
  )
}

function YearStep({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof ChevronLeft
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
    >
      <Icon className="size-3.5" />
    </button>
  )
}
