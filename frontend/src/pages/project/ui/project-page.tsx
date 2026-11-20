import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { domainColor, useDomain } from '@/entities/domain'
import {
  isProjectOpen,
  useProject,
  principalDomainId,
} from '@/entities/project'
import { isNotFound } from '@/shared/api'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { Skeleton, SkeletonRegion } from '@/shared/ui'
import { ProjectActivities } from '@/widgets/project/activities'
import { ProjectObjectives } from '@/widgets/project/objectives'
import { ProjectHeader } from '@/widgets/project/header'
import { ProjectLearning } from '@/widgets/project/learning'
import { ProjectPlan } from '@/widgets/project/plan'
import { ProjectWeek } from '@/widgets/project/week'
import { ResultValuesPanel } from '@/widgets/result-values'
import { SkillPanel } from '@/widgets/skill-panel'
import { ProjectSkillMaps } from '@/widgets/skill-tree'

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { data: project, isPending, error } = useProject(projectId)

  useDocumentTitle(project?.title)

  const { data: domain } = useDomain(project && principalDomainId(project))
  // Savoir ouvert dans le panneau latéral. Comme sur la page domaine, c'est la
  // page qui le monte : un arbre en lecture doit mener quelque part ici aussi,
  // sinon consulter les compétences d'un projet reste un cul-de-sac.
  const [openSkillId, setOpenSkillIdState] = useState<string | null>(null)
  // Résultat dont les relevés sont ouverts à droite (design #43). Les deux
  // panneaux occupent la même place : en ouvrir un ferme l'autre.
  const [openResultId, setOpenResultId] = useState<string | null>(null)
  const setOpenSkillId = (id: string | null) => {
    setOpenSkillIdState(id)
    if (id) setOpenResultId(null)
  }
  const toggleResult = (metricId: string) => {
    setOpenResultId((cur) => (cur === metricId ? null : metricId))
    setOpenSkillIdState(null)
  }
  // « Ouvrir le savoir ↗ » du bloc d'apprentissage mène à sa page, au cycle
  // de ce projet (#63 : arrivée depuis un projet → le cycle concerné) ;
  // le plan et la carte des savoirs, eux, ouvrent le panneau.
  const openSkillPage = (skillId: string) =>
    navigate(`/skills/${skillId}?projet=${projectId}`)
  // En édition du plan, la colonne de droite s'efface (design #27).
  const [planEditing, setPlanEditing] = useState(false)

  return (
    // Plus large que le reste de l'app : la maquette dessine la page sur
    // 1240 px, et le plan comme les objectifs en ont besoin (deux cartes
    // d'objectif par ligne). Décision du user, #29 point 1.
    <main className="mx-auto max-w-[1240px] px-10 py-12">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour
      </button>

      {isPending && (
        <SkeletonRegion>
          <div className="rounded-xl border bg-background">
            <div className="grid gap-3.5 rounded-t-xl bg-card px-6 pt-5 pb-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-[10px]" />
                <Skeleton className="h-6 w-1/2" />
              </div>
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex items-start gap-6 p-6">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-80 w-[364px] shrink-0 rounded-[10px]" />
            </div>
          </div>
        </SkeletonRegion>
      )}

      {error &&
        (isNotFound(error) ? (
          <p className="text-muted-foreground">
            Ce projet n'existe pas ou a été supprimé.
          </p>
        ) : (
          <p className="text-destructive">Impossible de charger ce projet.</p>
        ))}

      {project && (
        <>
          {/* Une seule carte (design #27) : l'en-tête en est le haut blanc, le
              corps suit sur le fond de page. Pas d'overflow caché : la colonne
              de droite doit pouvoir coller au défilement. */}
          <div className="rounded-xl border bg-background">
            <ProjectHeader
              project={project}
              domain={domain}
              onDeleted={() =>
                navigate(`/domains/${principalDomainId(project)}`)
              }
            />

            {/* Deux colonnes : le plan et les objectifs à gauche, ce qui se
                joue maintenant à droite, collé en haut au défilement. */}
            <div className="flex items-start gap-6 p-6">
              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-7">
                <ProjectPlan
                  project={project}
                  color={domainColor(domain?.color)}
                  colorKey={domain?.color}
                  emoji={domain?.emoji}
                  onEditingChange={setPlanEditing}
                  onOpenSkill={setOpenSkillId}
                  renderTree={(mode, onAttachModeChange) => (
                    <ProjectSkillMaps
                      project={project}
                      mode={mode}
                      openSkillId={openSkillId}
                      onOpenSkill={setOpenSkillId}
                      onAttachModeChange={onAttachModeChange}
                    />
                  )}
                />
                <ProjectObjectives
                  project={project}
                  openResultId={openResultId}
                  onToggleResult={toggleResult}
                />
              </div>
              {/* Un projet clos perd sa colonne : plus rien ne s'y joue
                  (design #32). */}
              {!planEditing && isProjectOpen(project.status) && (
                /* Plus collée à la hauteur de l'écran (#38) : la colonne suit
                   son contenu et défile avec la page. */
                <aside className="flex w-[364px] shrink-0 flex-col gap-6">
                  {/* « En ce moment » : la semaine et l'apprentissage, jusqu'à
                      la section « Activités types » (12/11). */}
                  <section className="flex flex-col gap-2.5">
                    <div className="flex min-h-7 items-center">
                      <h3 className="font-heading text-sm font-semibold">
                        En ce moment
                      </h3>
                    </div>
                    <div className="flex flex-col gap-3">
                      <ProjectWeek
                        project={project}
                        color={domainColor(domain?.color)}
                        emoji={domain?.emoji}
                      />
                      <ProjectLearning
                        project={project}
                        color={domainColor(domain?.color)}
                        domainEmoji={domain?.emoji}
                        onOpenSkill={openSkillPage}
                      />
                    </div>
                  </section>
                  <ProjectActivities
                    project={project}
                    colorKey={domain?.color}
                  />
                </aside>
              )}
            </div>
          </div>

          {openSkillId && (
            <SkillPanel
              skillId={openSkillId}
              onClose={() => setOpenSkillId(null)}
            />
          )}
          {openResultId && (
            <ResultValuesPanel
              project={project}
              domain={domain}
              metricId={openResultId}
              onClose={() => setOpenResultId(null)}
            />
          )}
        </>
      )}
    </main>
  )
}
