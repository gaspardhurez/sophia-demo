import { useMemo } from 'react'

import { domainColor, domainColorValues, useDomainsOf } from '@/entities/domain'
import { type Project, useSetProjectSkills } from '@/entities/project'
import { useCreateSkill, useReparentSkill, useSkills } from '@/entities/skill'
import { DetachSkillDialog } from '@/features/project/detach-skill'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { Skeleton, toast } from '@/shared/ui'

import { SkillMap } from './skill-map'

type MapProps = Parameters<typeof ProjectSkillMap>[0]

/**
 * Les cartes des savoirs d'un projet, une par domaine (#203) : un projet dans
 * plusieurs domaines vise et travaille des savoirs de chacun. Chaque arbre a
 * son bandeau titré, à la teinte de son domaine, le principal d'abord ; un
 * seul domaine, l'arbre seul, sans bandeau.
 */
export function ProjectSkillMaps(props: Omit<MapProps, 'domain'>) {
  const domains = useDomainsOf(props.project.domain_ids)
  if (domains.length <= 1)
    return <ProjectSkillMap {...props} domain={domains[0]} />
  return (
    <div className="flex flex-col gap-3">
      {domains.map((d, i) => {
        const c = domainColorValues(d.color)
        return (
          <div key={d.id} className="flex flex-col gap-2">
            <div
              className={cn(
                'flex h-[30px] items-center gap-2 rounded-lg px-2.5 font-heading text-[13px] font-semibold',
                domainColor(d.color).text,
              )}
              style={{
                background: `color-mix(in oklab, ${c.base} 8%, transparent)`,
              }}
            >
              {d.emoji} {d.name}
              {i === 0 && (
                <span className="text-[11px] font-semibold opacity-70">
                  · principal
                </span>
              )}
            </div>
            <ProjectSkillMap {...props} domain={d} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * La carte des savoirs d'un projet, branchée : rattacher, créer, détacher,
 * ranger. La page projet la fournit au plan, la création aussi, et au choix
 * des savoirs de son objectif Apprentissage (`picker`) — deux widgets ne
 * s'importent pas, c'est la page qui compose.
 */
export function ProjectSkillMap({
  project,
  domain,
  mode,
  openSkillId,
  onOpenSkill,
  onAttachModeChange,
  picker = false,
}: {
  project: Project
  /** Le domaine dont l'arbre se montre (#203 : un par domaine du projet). */
  domain?: { id: string; emoji: string | null; color: string | null }
  mode: 'read' | 'edit'
  openSkillId?: string | null
  onOpenSkill?: (id: string) => void
  onAttachModeChange?: (on: boolean) => void
  /** L'arbre seul, en mode rattachement, à la hauteur de son cadre. */
  picker?: boolean
}) {
  const { data: skills } = useSkills(domain?.id)
  const setSkills = useSetProjectSkills()
  const createSkill = useCreateSkill()
  const reparent = useReparentSkill()
  const levels = useMemo(
    () => new Map(project.learning.map((s) => [s.skill_id, s.level])),
    [project.learning],
  )
  const fail = (err: unknown) =>
    toast.error(
      err instanceof ApiError ? err.message : "L'enregistrement a échoué",
    )
  const attach = (id: string) =>
    setSkills
      .mutateAsync({
        id: project.id,
        skillIds: [...project.direct_skill_ids, id],
      })
      .catch(fail)

  if (!skills)
    return (
      <Skeleton
        className={
          picker ? 'h-full w-full rounded-xl' : 'h-60 w-full rounded-xl'
        }
      />
    )
  return (
    <SkillMap
      skills={skills}
      domainEmoji={domain?.emoji}
      color={domainColorValues(domain?.color)}
      levels={levels}
      mode={mode}
      picker={picker}
      openSkillId={openSkillId}
      onOpenSkill={onOpenSkill}
      onAttach={attach}
      onCreate={async (name, parentId) => {
        try {
          const created = await createSkill.mutateAsync({
            domainId: domain!.id,
            body: {
              name,
              parent_skill_id: parentId,
              status: 'not_started',
              // En dernier parmi ses frères.
              order: skills.filter((s) => s.parent_skill_id === parentId)
                .length,
            },
          })
          await attach(created.id)
        } catch (err) {
          fail(err)
        }
      }}
      // Le choix des savoirs ne range pas l'arbre : il rattache.
      onMove={
        picker
          ? undefined
          : (id, parentId, index) =>
              reparent
                .mutateAsync({ id, newParentId: parentId, index })
                .catch(fail)
      }
      onAttachModeChange={onAttachModeChange}
      renderDetach={(skillId, close) => (
        <DetachSkillDialog
          project={project}
          skillId={skillId}
          skillName={skills.find((s) => s.id === skillId)?.name ?? ''}
          onClose={close}
        />
      )}
    />
  )
}
