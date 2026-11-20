import { type ReactNode, useEffect, useRef } from 'react'

import type { components } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui'

type LibraryItem = components['schemas']['PracticeItemRead']
type RetentionSpacing = components['schemas']['RetentionSpacing']

/**
 * « + Exercice » / « + Mise en situation » en pied de tuile (#142, point 3) :
 * le bouton en pointillé, puis, ouvert, la liste des objets de la
 * bibliothèque absents du cycle à sa place. Un clic hors de la liste, ou
 * Échap, la referme.
 */
export function AddFromLibrary({
  label,
  open,
  onOpenChange,
  candidates,
  domainEmoji,
  onAdd,
  children,
}: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: LibraryItem[]
  domainEmoji: string
  onAdd: (itemId: string) => void
  /** Remplace la liste (le « Chercher ou créer » de l'appelant). */
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open, onOpenChange])

  if (!open)
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="mt-1 inline-flex h-7 items-center gap-[5px] self-start rounded-[7px] border border-dashed border-foreground/25 px-2.5 text-xs font-medium hover:border-foreground/45"
      >
        {label}
      </button>
    )
  return (
    <div
      ref={ref}
      className="mt-1 flex flex-col rounded-[9px] border bg-card p-1"
    >
      {children ??
        (candidates.length === 0 ? (
          <span className="px-2 py-1.5 text-xs text-muted-foreground">
            Rien d’autre dans la bibliothèque
          </span>
        ) : (
          candidates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onAdd(item.id)
                onOpenChange(false)
              }}
              className="flex min-h-[30px] items-center gap-2 rounded-md px-2 text-left text-[12.5px] hover:bg-muted"
            >
              <span className="w-4 text-center">
                {item.emoji || domainEmoji || '🧺'}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="text-[11.5px] text-muted-foreground">
                Bibliothèque
              </span>
            </button>
          ))
        ))}
    </div>
  )
}

/**
 * L'Espacement de la Rétention (#142, point 4) : « Prolonger la courbe
 * théorique » ou « Tous les n jours » ; choisi, le second se règle dessous.
 */
export function RetentionSpacingControl({
  mode,
  intervalDays,
  onChange,
}: {
  mode: RetentionSpacing
  intervalDays: number | null
  onChange: (patch: {
    retention_spacing?: RetentionSpacing
    retention_interval_days?: number | null
  }) => void
}) {
  const days = intervalDays ?? 45
  const options: [RetentionSpacing, string][] = [
    ['curve', 'Prolonger la courbe théorique'],
    ['custom', `Tous les ${days} jours`],
  ]
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <span className="text-xs font-semibold">Espacement</span>
      <span className="flex flex-wrap gap-1">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onChange({ retention_spacing: value })}
            className={cn(
              'h-[26px] rounded-full border px-2.5 text-xs',
              mode === value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card',
            )}
          >
            {label}
          </button>
        ))}
      </span>
      {mode === 'custom' && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Tous les
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) =>
              onChange({
                retention_interval_days: Number(e.target.value) || null,
              })
            }
            className="h-7 w-16"
          />
          jours
        </label>
      )}
    </div>
  )
}
