import { useEffect, useMemo, useState } from 'react'
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import { useDomains } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import { pickCycle, usePlans } from '@/entities/plan'
import { usePracticeItems } from '@/entities/practice'
import { skillPaths, useSkill, useSkills } from '@/entities/skill'
import { isNotFound } from '@/shared/api'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { Skeleton, SkeletonRegion } from '@/shared/ui'
import { SkillHeader } from '@/widgets/skill-header'
import {
  NewCycle,
  SkillOverview,
  SkillWorkbench,
} from '@/widgets/skill-workbench'

/** La valeur de `?cycle=` qui demande la vue d'ensemble. */
const OVERVIEW = 'savoir'

/**
 * La page d'un savoir (design #63 et #65, `prod/Savoir`) — le cadre Domaine :
 * l'en-tête du savoir, les onglets des cycles, puis **un cycle** (cas par
 * défaut) ou la **vue d'ensemble**.
 *
 * Le cycle montré se lit dans l'URL (`?cycle=<id>`, ou `savoir`) ; arrivé
 * depuis un projet (`?projet=<id>`), c'est le cycle de ce projet. Sans indication, le
 * cycle en cours, sinon le dernier prévu, sinon le dernier clos ; sans cycle,
 * la vue savoir.
 *
 * La page **assemble** : le cycle (onglets, Notes, phases, séances) et la vue
 * savoir sont deux widgets.
 */
export function SkillPage() {
  const { skillId } = useParams<{ skillId: string }>()
  const { data: skill, isPending, error } = useSkill(skillId)
  useDocumentTitle(skill?.name)

  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  const { data: siblings } = useSkills(skill?.domain_id)
  const { data: plans } = usePlans(skill ? skillId : undefined)
  const { data: library } = usePracticeItems(skill ? skillId : undefined)

  const [params, setParams] = useSearchParams()
  const wanted = params.get('cycle')
  // Arrivée depuis un projet : son cycle (non abandonné), s'il en a un.
  const fromProject = params.get('projet')
  // Arrivée depuis l'acte d'une activité (#82) : la modale de cet objet.
  const openItemId = params.get('objet')

  // On arrive sur l'onglet « Nouveau cycle » depuis le panneau latéral :
  // c'est ici qu'un cycle se crée. Consommé une fois ; le brouillon, lui, ne
  // vit que dans la page (recharger le jette).
  const location = useLocation()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(
    () => (location.state as { creating?: boolean } | null)?.creating === true,
  )
  useEffect(() => {
    if ((location.state as { creating?: boolean } | null)?.creating) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      })
    }
  }, [location, navigate])

  const path = useMemo(
    () => (skill ? (skillPaths(siblings ?? []).get(skill.id) ?? '') : ''),
    [siblings, skill],
  )
  const domain = domains?.find((d) => d.id === skill?.domain_id)
  const projectCycle = fromProject
    ? plans?.find(
        (p) => p.state !== 'abandoned' && p.project_ids.includes(fromProject),
      )
    : undefined
  const plan =
    plans && wanted !== OVERVIEW
      ? ((wanted ? null : projectCycle) ?? pickCycle(plans, wanted))
      : null

  function select(planId: string | null) {
    setEditing(false)
    setCreating(false)
    setParams(planId ? { cycle: planId } : { cycle: OVERVIEW }, {
      replace: true,
    })
  }

  function startNew() {
    setEditing(false)
    setCreating(true)
  }

  if (error) {
    return (
      <main className="px-9 py-7 max-md:px-4">
        <p className="text-sm text-muted-foreground">
          {isNotFound(error)
            ? "Ce savoir n'existe pas ou a été supprimé."
            : 'Impossible de charger ce savoir.'}
        </p>
      </main>
    )
  }

  return (
    <main className="min-w-0">
      {isPending && (
        <SkeletonRegion>
          <div className="bg-background">
            <div className="grid gap-3 border-b bg-card px-6 py-5">
              <Skeleton className="h-3 w-40" />
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-[10px]" />
                <Skeleton className="h-6 w-56" />
              </div>
            </div>
            <div className="h-64" />
          </div>
        </SkeletonRegion>
      )}

      {skill && (
        <div className="bg-background">
          <SkillHeader
            skill={skill}
            path={path}
            domain={domain}
            skills={siblings ?? []}
            projects={projects ?? []}
            cycleCount={(plans ?? []).length}
            openedAt={
              plans?.find((p) => p.state === 'active')?.opened_at ?? null
            }
            cycleDot={
              plans?.some((p) => p.state === 'active')
                ? 'active'
                : plans?.some((p) => p.state === 'draft')
                  ? 'planned'
                  : null
            }
            onDeleted={() => navigate(`/domains/${skill.domain_id}`)}
          />

          {plans &&
            library &&
            projects &&
            (creating ? (
              <NewCycle
                skill={skill}
                domain={domain}
                plans={plans}
                projects={projects}
                onSelect={select}
                onCancel={() => setCreating(false)}
                onCreated={(created) => select(created.id)}
              />
            ) : plan ? (
              <SkillWorkbench
                key={plan.id}
                skill={skill}
                domain={domain}
                plan={plan}
                plans={plans}
                library={library}
                projects={projects}
                editing={editing}
                onEditingChange={setEditing}
                onSelect={select}
                onNew={startNew}
                openItemId={openItemId}
              />
            ) : (
              <SkillOverview
                skill={skill}
                domain={domain}
                plans={plans}
                library={library}
                projects={projects}
                onSelect={select}
                onNew={startNew}
                openItemId={openItemId}
              />
            ))}
        </div>
      )}
    </main>
  )
}
