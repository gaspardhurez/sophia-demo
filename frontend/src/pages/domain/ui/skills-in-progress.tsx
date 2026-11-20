import { domainColorValues } from '@/entities/domain'
import { SkillPill, useSkills } from '@/entities/skill'

/**
 * Les savoirs **En cours** du domaine, en pastilles au-dessus de l'arbre
 * (design #51). Un clic ouvre le savoir dans le panneau de la page, le même
 * geste qu'une feuille de l'arbre.
 */
export function SkillsInProgress({
  domainId,
  colorKey,
  onOpenSkill,
}: {
  domainId: string
  colorKey: string | null
  onOpenSkill: (skillId: string) => void
}) {
  const { data: skills } = useSkills(domainId)
  const open = (skills ?? []).filter((s) => s.status === 'in_progress')
  if (open.length === 0) return null
  const colors = domainColorValues(colorKey)
  return (
    <div className="flex flex-wrap gap-2">
      {open.map((s) => (
        <SkillPill
          key={s.id}
          skill={s}
          colors={colors}
          onClick={() => onOpenSkill(s.id)}
        />
      ))}
    </div>
  )
}
