import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { isDomainActive, useDomains } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import { CreateDomainDialog } from '@/features/domain/create'
import { addDays, startOfWeek } from '@/shared/lib/date'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { EmptyState, Skeleton, SkeletonRegion } from '@/shared/ui'
import { DailyAgenda } from '@/widgets/daily-agenda'
import { SkillPanel } from '@/widgets/skill-panel'
import { WeekBoard } from '@/widgets/week-board'

import { DomainFilter } from './domain-filter'
import { HomeSection } from './home-section'
import { NowSection } from './now-section'
import { YearSection } from './year-section'

/** Le filtre vit dans l'adresse : il survit à l'aller-retour vers un domaine. */
const FILTER_PARAM = 'domaines'

function weekRange(today: Date): string {
  const monday = startOfWeek(today)
  const sunday = addDays(monday, 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} → ${fmt(sunday)}`
}

/**
 * L'accueil (design #52, `prod/Accueil`) : trois sections — **Cette semaine**
 * (la to-do du jour, la semaine en sept colonnes), **En ce moment** (les
 * projets en cours, les savoirs en cours), **Cette année** (la frise des
 * domaines actifs). Le filtre de domaines, à droite du premier titre,
 * s'applique à toute la page ; c'est aussi l'accès aux domaines.
 */
export function HomePage() {
  const { data: domains, isPending, isError } = useDomains()
  const { data: projects } = useAllProjects()
  const [params, setParams] = useSearchParams()
  const [openSkillId, setOpenSkillId] = useState<string | null>(null)

  useDocumentTitle('Accueil')

  const raw = params.get(FILTER_PARAM)
  // Un domaine supprimé depuis ne reste pas dans le filtre.
  const selected = useMemo(() => {
    const ids = raw ? raw.split(',') : []
    return domains ? ids.filter((id) => domains.some((d) => d.id === id)) : ids
  }, [raw, domains])
  const setSelected = (ids: string[]) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (ids.length) next.set(FILTER_PARAM, ids.join(','))
        else next.delete(FILTER_PARAM)
        return next
      },
      { replace: true },
    )
  const keep = useCallback(
    (domainId: string) => selected.length === 0 || selected.includes(domainId),
    [selected],
  )

  const frisedDomains = useMemo(
    () => (domains ?? []).filter((d) => isDomainActive(d) && keep(d.id)),
    [domains, keep],
  )

  return (
    // La largeur de la page domaine et de la page projet : sept colonnes et
    // la to-do tiennent côte à côte.
    <main className="mx-auto max-w-[1240px] px-10 py-12">
      {isPending && (
        <SkeletonRegion className="flex flex-col gap-10">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-[minmax(320px,440px)_minmax(600px,1fr)] gap-5">
            <Skeleton className="h-[320px] rounded-lg" />
            <Skeleton className="h-[320px] rounded-lg" />
          </div>
        </SkeletonRegion>
      )}

      {isError && (
        <p className="text-destructive">
          Impossible de charger les domaines. Le backend tourne-t-il ?
        </p>
      )}

      {domains && domains.length === 0 && (
        <EmptyState action={<CreateDomainDialog />}>
          Aucun domaine pour l'instant. Crée le premier.
        </EmptyState>
      )}

      {domains && domains.length > 0 && (
        <div className="flex flex-col gap-10">
          <HomeSection
            title="Cette semaine"
            meta={weekRange(new Date())}
            action={
              <DomainFilter
                domains={domains}
                selected={selected}
                onChange={setSelected}
              />
            }
          >
            {/* La to-do entre 260 et 300 px, la semaine jamais sous 600 :
                en deçà, on défile plutôt que d'écraser sept colonnes. */}
            <div className="grid grid-cols-[minmax(320px,440px)_minmax(600px,1fr)] items-start gap-5 overflow-x-auto">
              <DailyAgenda domainIds={selected} />
              <WeekBoard domainIds={selected} calendarHref="/calendar" />
            </div>
          </HomeSection>

          <NowSection
            projects={projects}
            domains={domains}
            keep={keep}
            onOpenSkill={setOpenSkillId}
          />

          <YearSection domains={frisedDomains} projects={projects ?? []} />
        </div>
      )}

      {openSkillId && (
        <SkillPanel
          skillId={openSkillId}
          onClose={() => setOpenSkillId(null)}
        />
      )}
    </main>
  )
}
