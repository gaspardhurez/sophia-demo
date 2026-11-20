import { domainColor, domainColorValues } from '@/entities/domain'
import { useProjectMetrics } from '@/entities/metric'
import { type Project, UnitMarkGlyph, projectEmoji } from '@/entities/project'
import { formatDateShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

import {
  LEARNING_EMOJI,
  type TrackingChip,
  trackingChips,
} from '@/features/project/tracking'

/**
 * L'en-tête en résumé (design #33) : ce que le projet en création est déjà —
 * tuile, titre, période —, et ses objectifs en chips teintées, dans l'ordre des
 * cartes. Les chips du suivi (#34), sans avancement : rien n'a encore commencé.
 */
export function ProjectSummary({
  project,
  domain,
}: {
  project: Project
  domain?: { emoji: string | null; color: string | null }
}) {
  const { data: results } = useProjectMetrics(project.id)
  const chips = trackingChips(project, results ?? [])
  const color = domainColor(domain?.color)
  const tint = `color-mix(in oklab, ${domainColorValues(domain?.color).base} 12%, transparent)`
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-[10px] border text-xl',
            color.soft,
          )}
        >
          {projectEmoji(project, domain?.emoji)}
        </span>
        <span className="min-w-0 truncate font-heading text-xl font-semibold tracking-[-0.01em]">
          {project.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {project.due_at
            ? `${formatDateShort(project.start_at)} → ${formatDateShort(project.due_at)}`
            : `Depuis le ${formatDateShort(project.start_at)}`}
        </span>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span
              key={`${c.kind}:${c.id}`}
              className={cn(
                'inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap',
                color.text,
              )}
              style={{ background: tint }}
            >
              <SummaryChipBody chip={c} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryChipBody({ chip }: { chip: TrackingChip }) {
  switch (chip.kind) {
    case 'total':
      return (
        <>
          {chip.fullTarget}
          <UnitMarkGlyph
            mark={chip.mark}
            className="text-[13px] text-current"
          />
        </>
      )
    case 'learning':
      return (
        <>
          <span aria-hidden>{LEARNING_EMOJI}</span>
          {chip.target}
        </>
      )
    case 'result':
      return (
        <>
          {chip.emoji && <span>{chip.emoji}</span>}
          {chip.sentence}
        </>
      )
    case 'achievement':
      return (
        <>
          {chip.emoji && <span>{chip.emoji}</span>}
          {chip.title}
        </>
      )
  }
}
