import { Check, Plus, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

import type { Project } from '../model/types'

/**
 * Les projets choisis, en chips (× pour détacher), et « + Projet » qui
 * ouvre une liste à cases (design #65 et #66, champ « Pour » d'un cycle).
 *
 * La liste propose les `candidates`, plus ceux déjà choisis qui n'y sont pas
 * (un projet devenu clos reste détachable).
 */
export function ProjectsField({
  value,
  onChange,
  candidates,
  projects,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  candidates: Project[]
  /** Tous les projets, pour nommer ceux qui sont choisis. */
  projects: Project[]
}) {
  const titleOf = (id: string) =>
    projects.find((o) => o.id === id)?.title ?? 'Projet'
  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    )
  const options = [
    ...candidates,
    ...projects.filter(
      (o) => value.includes(o.id) && !candidates.some((c) => c.id === o.id),
    ),
  ]

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id) => (
        <span
          key={id}
          className="inline-flex h-[26px] items-center gap-0.5 rounded-md border bg-card pr-[3px] pl-2 text-[13px] font-medium whitespace-nowrap"
        >
          🎯 {titleOf(id)}
          <button
            type="button"
            aria-label="Détacher"
            onClick={() => toggle(id)}
            className="grid size-5 place-items-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-[26px] items-center gap-1 rounded-md border border-dashed border-ring/60 px-2 text-xs font-medium text-foreground/80 hover:bg-muted/50"
          >
            <Plus className="size-[11px]" /> Projet
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] p-1.5">
          {options.length === 0 && (
            <p className="px-1.5 py-1 text-[13px] text-muted-foreground">
              Aucun projet ouvert dans ce domaine.
            </p>
          )}
          {options.map((o) => {
            const on = value.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(o.id)}
                className="flex h-[30px] w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-3.5 shrink-0 place-items-center rounded-[4px] text-background',
                    on ? 'bg-foreground' : 'border-[1.5px] border-ring/70',
                  )}
                >
                  {on && <Check className="size-2.5" />}
                </span>
                🎯 <span className="min-w-0 flex-1 truncate">{o.title}</span>
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}
