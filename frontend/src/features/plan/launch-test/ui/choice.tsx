import { cn } from '@/shared/lib/utils'

/** Une entrée du menu « Lancer l'interro » : emoji teinté, titre, jour. */
export function Choice({
  emoji,
  title,
  sub,
  emojiClassName,
  disabled,
  onClick,
}: {
  emoji: string
  title: string
  sub: string
  emojiClassName: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 items-center gap-2.5 rounded-[7px] px-2 py-1 text-left hover:bg-muted disabled:opacity-60"
    >
      <span
        className={cn(
          'grid size-[26px] shrink-0 place-items-center rounded-[7px] text-[13px]',
          emojiClassName,
        )}
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {sub}
      </span>
    </button>
  )
}
