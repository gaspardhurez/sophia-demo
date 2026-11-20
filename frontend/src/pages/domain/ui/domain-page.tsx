import { ChevronLeft, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useDomain } from '@/entities/domain'
import { useProjects } from '@/entities/project'
import { isNotFound } from '@/shared/api'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { Button, SectionTitle, Skeleton, SkeletonRegion } from '@/shared/ui'
import { DomainActivityTypes } from '@/widgets/domain-activity-types'
import { DomainHeader } from '@/widgets/domain-header'
import { DomainMetrics, MetricValuesVolet } from '@/widgets/domain-metrics'
import { SkillPanel } from '@/widgets/skill-panel'
import { ManageSkillsDialog, SkillTree } from '@/widgets/skill-tree'

import { DomainProjects } from './domain-projects'
import { SkillsInProgress } from './skills-in-progress'

/**
 * La page d'un domaine (design #51, `prod/Domaine`) : une carte, l'en-tête en
 * haut (nom, statut, vision, frise des saisons), puis deux colonnes — à
 * gauche Projets, Savoirs, Métriques ; à droite (340 px) les activités types
 * et leur repli, et le calendrier du domaine sur trois jours.
 */
export function DomainPage() {
  const { domainId } = useParams<{ domainId: string }>()
  const navigate = useNavigate()
  const { data: domain, isPending, error } = useDomain(domainId)
  const { data: projects } = useProjects(domainId)

  useDocumentTitle(domain?.name)

  // La barre choisie sur la frise : la liste des projets ne garde qu'elle.
  const [seasonId, setSeasonId] = useState<string | null>(null)
  // Les panneaux latéraux sont montés par la page (deux widgets ne
  // s'importent pas) et se partagent la place : ouvrir l'un ferme l'autre.
  const [openSkillId, setOpenSkillIdState] = useState<string | null>(null)
  const [openMetricId, setOpenMetricId] = useState<string | null>(null)
  const openSkill = (id: string | null) => {
    setOpenSkillIdState(id)
    setOpenMetricId(null)
  }
  const toggleMetric = (id: string) => {
    setOpenMetricId((cur) => (cur === id ? null : id))
    setOpenSkillIdState(null)
  }

  return (
    // La largeur de la page projet : la maquette dessine les deux sur
    // 1240 px, colonne de droite comprise.
    <main className="mx-auto max-w-[1240px] px-10 py-12">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2 text-muted-foreground"
      >
        <Link to="/">
          <ChevronLeft className="size-4" />
          Accueil
        </Link>
      </Button>

      {isPending && (
        <SkeletonRegion>
          <div className="rounded-xl border bg-background">
            <div className="grid gap-3 rounded-t-xl border-b bg-card px-6 py-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-[10px]" />
                <Skeleton className="h-6 w-56" />
              </div>
              <Skeleton className="h-3 w-96" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex items-start gap-6 p-6">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-80 w-[340px] shrink-0 rounded-[10px]" />
            </div>
          </div>
        </SkeletonRegion>
      )}

      {error &&
        (isNotFound(error) ? (
          <p className="text-muted-foreground">
            Ce domaine n'existe pas ou a été supprimé.
          </p>
        ) : (
          <p className="text-destructive">
            Impossible de charger ce domaine. Le backend tourne-t-il ?
          </p>
        ))}

      {domain && (
        <>
          <div className="rounded-xl border bg-background">
            <DomainHeader
              domain={domain}
              projects={projects ?? []}
              selectedProjectId={seasonId}
              onSelectProject={setSeasonId}
              onDeleted={() => navigate('/')}
            />

            <div className="flex items-start gap-6 p-6">
              <div className="flex min-w-0 flex-1 flex-col gap-7">
                {/* « En chiffres » d'abord (12/11). */}
                <DomainMetrics
                  domainId={domain.id}
                  openMetricId={openMetricId}
                  onToggleMetric={toggleMetric}
                />

                <DomainProjects
                  domain={domain}
                  projects={projects}
                  selectedId={seasonId}
                />

                <section className="flex min-w-0 flex-col gap-2.5">
                  <SectionTitle as="h3" className="mb-0">
                    Savoirs
                  </SectionTitle>
                  <SkillsInProgress
                    domainId={domain.id}
                    colorKey={domain.color}
                    onOpenSkill={openSkill}
                  />
                  {/* Un clic sur une feuille ouvre son panneau ; un savoir à
                      enfants se déplie, sa fiche s'ouvre au clic droit. */}
                  <SkillTree
                    domainId={domain.id}
                    domainName={domain.name}
                    onOpenSkill={openSkill}
                    action={
                      <ManageSkillsDialog
                        context={{ level: 'domain', domainId: domain.id }}
                        trigger={
                          <Button
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                          >
                            <Pencil className="size-4" /> Modifier
                          </Button>
                        }
                      />
                    }
                  />
                </section>
              </div>

              <aside className="flex w-[340px] shrink-0 flex-col gap-7">
                <DomainActivityTypes
                  domain={domain}
                  projects={projects ?? []}
                />
              </aside>
            </div>
          </div>

          {openSkillId && (
            <SkillPanel
              skillId={openSkillId}
              onClose={() => setOpenSkillIdState(null)}
            />
          )}
          {openMetricId && (
            <MetricValuesVolet
              domain={domain}
              metricId={openMetricId}
              onClose={() => setOpenMetricId(null)}
            />
          )}
        </>
      )}
    </main>
  )
}
