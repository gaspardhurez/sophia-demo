import type { DomainColorClasses } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

import {
  Crans,
  OpenSkillPage,
  PHASES,
  type PlanSkill,
  skillPageOf,
} from './plan-skills'

/**
 * « Hors séquence » (design #27) : les
 * savoirs visés que la séquence ne range pas, commencés ou non. En lecture, ils
 * se listent depuis l'en-tête du plan, jamais dans le fil des étapes.
 */
export function OutOfSequence({
  projectId,
  skills,
  emoji,
  color,
  onHoverChange,
  onOpenChange,
  onOpenSkill,
}: {
  projectId: string
  skills: PlanSkill[]
  emoji?: string | null
  color: DomainColorClasses
  /** Survolé ou ouvert, il retire le crayon du plan. */
  onHoverChange?: (on: boolean) => void
  onOpenChange?: (open: boolean) => void
  /** Un clic sur un savoir l'ouvre dans le panneau latéral. */
  onOpenSkill?: (skillId: string) => void
}) {
  if (skills.length === 0) return null
  const rest = skills.length - 3
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Savoirs hors séquence"
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
          className="flex h-7 items-center gap-2 rounded-full pr-1.5 pl-2 hover:bg-muted"
        >
          <span className="text-[10px] font-semibold tracking-[.05em] whitespace-nowrap text-muted-foreground uppercase">
            Hors séquence
          </span>
          <span className="flex pl-1.5">
            {skills.slice(0, 3).map((s) => (
              <span
                key={s.skill_id}
                className="-ml-1.5 grid size-6 place-items-center rounded-full bg-muted text-xs ring-2 ring-card"
              >
                {emoji}
              </span>
            ))}
            {rest > 0 && (
              <span className="ml-1 self-center text-xs font-semibold text-muted-foreground tabular-nums">
                +{rest}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        {skills.map((s) => (
          <div
            key={s.skill_id}
            className="group/skill flex h-8 items-center gap-1 rounded-lg pr-1 hover:bg-muted"
          >
            <button
              type="button"
              disabled={!onOpenSkill}
              onClick={() => onOpenSkill?.(s.skill_id)}
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-[13px] not-disabled:cursor-pointer"
            >
              <span>{emoji}</span>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.level > 0 && s.level < 4 && (
                <span
                  className={cn('shrink-0 text-xs font-medium', color.text)}
                >
                  {PHASES[s.level - 1]}
                </span>
              )}
              <Crans level={s.level} color={color} className="w-12" />
            </button>
            <OpenSkillPage to={skillPageOf(s.skill_id, projectId)} />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
