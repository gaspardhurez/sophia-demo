import { cn } from '@/shared/lib/utils'

/** Un choix de modale : pastille radio, libellé, précision (kit). */
export function RadioChoice({
  checked,
  label,
  detail,
  onSelect,
}: {
  checked: boolean
  label: string
  detail?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
        checked
          ? 'border-foreground/40 bg-muted/40'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
          checked ? 'border-foreground' : 'border-ring',
        )}
      >
        {checked && <span className="size-2 rounded-full bg-foreground" />}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {detail && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
    </button>
  )
}
