import { useAllProjects } from '@/entities/project'
import { usePlans } from '@/entities/plan'
import { type Skill, useSkills } from '@/entities/skill'
import { DeleteSkillDialog } from '@/features/skill/delete-skill'

/**
 * Supprimer un savoir depuis le clic droit de l'arbre : **la même fenêtre que
 * le panneau** — ce qui est perdu, puis le sort des enfants (remontés ou
 * supprimés avec lui). Monté seulement quand on la demande, pour ne charger
 * projets et cycles qu'à ce moment-là.
 */
export function DeleteSkillFromTree({
  skill,
  onClose,
}: {
  skill: Skill
  onClose: () => void
}) {
  const { data: siblings } = useSkills(skill.domain_id)
  const { data: projects } = useAllProjects()
  const { data: plans } = usePlans(skill.id)

  return (
    <DeleteSkillDialog
      skill={skill}
      childCount={
        (siblings ?? []).filter((s) => s.parent_skill_id === skill.id).length
      }
      parentName={
        (siblings ?? []).find((s) => s.id === skill.parent_skill_id)?.name ??
        null
      }
      projects={(projects ?? []).filter((o) => o.skill_ids.includes(skill.id))}
      cycleCount={(plans ?? []).length}
      onClose={onClose}
      onDeleted={onClose}
    />
  )
}
