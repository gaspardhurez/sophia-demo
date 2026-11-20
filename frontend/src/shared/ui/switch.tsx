import { cn } from '@/shared/lib/utils'

/**
 * Interrupteur 30 × 18 du kit (`kit/Etape`, `kit/Activites types`). Purement
 * présentationnel : c'est la ligne ou le bouton qui le porte qui reçoit le
 * clic. L'encre allumée est celle du domaine, fournie par l'appelant.
 */
export function Switch({
  on,
  onClassName,
  label,
  className,
}: {
  on: boolean
  /** Fond allumé — l'encre du domaine (`domainColor(...).ink`). */
  onClassName?: string
  label?: string
  className?: string
}) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cn(
        'inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-0.5 transition-colors',
        on
          ? cn('justify-end', onClassName ?? 'bg-foreground')
          : 'justify-start bg-border',
        className,
      )}
    >
      <span className="size-3.5 rounded-full bg-white shadow-sm" />
    </span>
  )
}
