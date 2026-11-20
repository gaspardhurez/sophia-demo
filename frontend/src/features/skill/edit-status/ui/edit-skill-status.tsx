import { Check } from 'lucide-react'

import {
  type Skill,
  SKILL_STATUS_META,
  SKILL_STATUSES,
  SkillStatusBadge,
  SkillStatusDot,
  type SkillStatus,
  useUpdateSkill,
} from '@/entities/skill'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@/shared/ui'

export function EditSkillStatus({
  skill,
  compact = false,
}: {
  skill: Skill
  /** Pastille au lieu du badge — sur une ligne déjà pleine (nœud d'arbre). */
  compact?: boolean
}) {
  const updateSkill = useUpdateSkill()

  async function onSelect(status: SkillStatus) {
    if (status === skill.status) return
    try {
      await updateSkill.mutateAsync({ id: skill.id, body: { status } })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={updateSkill.isPending}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          aria-label="Changer le statut"
        >
          {compact ? (
            <SkillStatusDot status={skill.status} />
          ) : (
            <SkillStatusBadge status={skill.status} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SKILL_STATUSES.map((status) => (
          <DropdownMenuItem key={status} onSelect={() => onSelect(status)}>
            <Check
              className={cn(
                'size-4',
                status === skill.status ? 'opacity-100' : 'opacity-0',
              )}
            />
            {SKILL_STATUS_META[status].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
