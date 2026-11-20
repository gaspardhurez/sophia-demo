import { ArrowDown, ArrowUp } from 'lucide-react'

import type { MetricFormValues } from '@/entities/metric'
import { UnitField } from '@/entities/unit'
import { cn } from '@/shared/lib/utils'
import { EmojiField } from '@/shared/ui'

const DIRECTIONS = [
  { key: 'up', label: 'Le plus haut', Icon: ArrowUp },
  { key: 'down', label: 'Le plus bas', Icon: ArrowDown },
] as const

/**
 * Ce qu'est une métrique, en quatre champs (design #27) : emoji et nom en tête, puis l'unité et le sens du record.
 *
 * Présentationnel : la création garde les valeurs en brouillon, les options
 * les écrivent à chaque changement — le nom, lui, quand on le quitte.
 */
export function MetricFields({
  values,
  onChange,
  onNameCommit,
  autoFocusName,
}: {
  values: MetricFormValues
  onChange: (patch: Partial<MetricFormValues>) => void
  /** Le nom quitté (blur, Entrée). */
  onNameCommit?: () => void
  autoFocusName?: boolean
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-2">
        <EmojiField
          value={values.emoji || undefined}
          onChange={(v) => onChange({ emoji: v ?? '' })}
          aria-label="Emoji de la métrique"
          className="size-8 shrink-0"
        />
        <input
          value={values.name}
          autoFocus={autoFocusName}
          placeholder="Nom"
          aria-label="Nom de la métrique"
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={onNameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 font-heading text-[15px] font-semibold outline-none hover:border-border focus:border-ring"
        />
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 px-2.5 pb-2.5">
        <span className="text-xs text-muted-foreground">Unité</span>
        <UnitField
          value={values.unit_id ?? null}
          onChange={(id) => onChange({ unit_id: id })}
          placeholder="kg, minutes, watts…"
          className="h-7"
        />
        <span className="text-xs text-muted-foreground">Record</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-md bg-muted p-0.5">
          {DIRECTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={values.direction === key}
              onClick={() => onChange({ direction: key })}
              className={cn(
                'inline-flex h-6 items-center justify-center gap-1 rounded-[5px] px-1.5 text-xs font-semibold whitespace-nowrap',
                values.direction === key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3 shrink-0" strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
