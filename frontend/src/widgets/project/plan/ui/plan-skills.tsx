import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DomainColorClasses } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'

export const PHASES = [
  'Étude',
  'Pratique',
  'Mise en situation',
  'Rétention',
] as const

/** Un savoir visé tel que le plan le lit. */
export interface PlanSkill {
  skill_id: string
  name: string
  level: number
  position: number | null
}

/**
 * La jauge d'un savoir en quatre crans (design #27) : plein = phase finie,
 * pâle = phase en cours, gris = à venir ; tout plein une fois acquis.
 */
export function Crans({
  level,
  color,
  className,
}: {
  level: number
  color: DomainColorClasses
  className?: string
}) {
  return (
    <span
      className={cn('flex shrink-0 gap-0.5', className)}
      title={
        level >= 4 ? 'Acquis' : level > 0 ? PHASES[level - 1] : 'Pas commencé'
      }
    >
      {PHASES.map((p, i) => (
        <span
          key={p}
          className={cn(
            'h-[5px] flex-1 rounded-[2px]',
            level >= 4 || i < level - 1
              ? color.ink
              : i === level - 1
                ? cn('border', color.soft)
                : 'bg-muted',
          )}
        />
      ))}
    </span>
  )
}

/** La page d'un savoir, sur le cycle de ce projet. */
export const skillPageOf = (skillId: string, projectId: string) =>
  `/skills/${skillId}?projet=${projectId}`

/** « Ouvrir la page ↗ », au survol de la ligne (`group/skill`). */
export function OpenSkillPage({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="Ouvrir la page"
      title="Ouvrir la page"
      onClick={(e) => e.stopPropagation()}
      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/skill:opacity-100 hover:bg-border/60 hover:text-foreground focus-visible:opacity-100"
    >
      <ArrowUpRight className="size-3.5" />
    </Link>
  )
}

/**
 * Une ligne de la séquence : rang, emoji, nom, phase en cours, jauge. Un clic
 * ouvre le savoir dans le panneau latéral, quand la page en monte un ; au
 * survol, ↗ mène directement à sa page, sur le cycle du projet.
 */
export function SkillRow({
  skill,
  emoji,
  color,
  projectId,
  onOpen,
}: {
  skill: PlanSkill
  emoji?: string | null
  color: DomainColorClasses
  /** Le projet du plan : la page du savoir s'ouvre sur son cycle. */
  projectId?: string
  onOpen?: (skillId: string) => void
}) {
  const open = skill.level > 0 && skill.level < 4
  const Row = onOpen ? 'button' : 'div'
  return (
    <div
      className={cn(
        'group/skill flex h-8 min-w-0 items-center gap-1 rounded-md pr-1 transition-opacity hover:bg-muted',
        skill.level >= 4 && 'opacity-45 hover:opacity-100',
      )}
    >
      <Row
        {...(onOpen && {
          type: 'button' as const,
          onClick: () => onOpen(skill.skill_id),
        })}
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-2.5 px-1.5 text-left',
          onOpen && 'cursor-pointer',
        )}
      >
        <span className="w-[15px] shrink-0 text-center text-[11px] text-muted-foreground tabular-nums">
          {skill.position ?? ''}
        </span>
        <span className="text-[13px] leading-none">{emoji}</span>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {skill.name}
        </span>
        {open && (
          <span className={cn('shrink-0 text-xs font-medium', color.text)}>
            {PHASES[skill.level - 1]}
          </span>
        )}
        <Crans level={skill.level} color={color} className="w-16" />
      </Row>
      {projectId && (
        <OpenSkillPage to={skillPageOf(skill.skill_id, projectId)} />
      )}
    </div>
  )
}

/** Un carré par savoir : gris → teinte par phase → encre si acquis. */
export function Mosaic({
  skills,
  color,
}: {
  skills: PlanSkill[]
  color: DomainColorClasses
}) {
  return (
    <div className="flex flex-wrap gap-[3px]">
      {skills.map((s) => (
        <span
          key={s.skill_id}
          title={s.name}
          className={cn(
            'size-2.5 rounded-[3px]',
            s.level >= 4 ? color.ink : s.level > 0 ? color.dot : 'bg-muted',
          )}
          style={
            s.level > 0 && s.level < 4
              ? { opacity: [0, 0.3, 0.5, 0.75][s.level] }
              : undefined
          }
        />
      ))}
    </div>
  )
}
