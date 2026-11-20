import { Check, ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui'

/** Les bornes du critère (`PlanItemUpdate`) : 1 à 10 passes, à 3/5 au moins. */
const PASSES = { min: 1, max: 10 } as const
const LEVELS = [3, 4, 5] as const

/**
 * Le **critère de maîtrise** d'un objet de Pratique ou de Mise en situation,
 * en Modifier (#157, `kit/Fiche piece`) : « Maîtrisée après [− 3 +] passes à
 * [5/5 ▾] ». Défaut 3 passes à 5/5 ; il se règle par pièce, dans ce cycle.
 *
 * Contrôlé : l'appelant tient le brouillon et l'enregistre.
 */
export function CriterionField({
  passes,
  level,
  onChange,
}: {
  passes: number
  level: number
  onChange: (next: { passes: number; level: number }) => void
}) {
  const step = (delta: number) =>
    onChange({
      passes: Math.min(PASSES.max, Math.max(PASSES.min, passes + delta)),
      level,
    })
  const box =
    'inline-flex h-8 items-center rounded-[7px] border border-border bg-card'
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[13px] font-semibold">Maîtrisée après</h3>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className={box}>
          <button
            type="button"
            aria-label="Moins"
            disabled={passes <= PASSES.min}
            onClick={() => step(-1)}
            className="size-[30px] disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-6 text-center font-semibold tabular-nums">
            {passes}
          </span>
          <button
            type="button"
            aria-label="Plus"
            disabled={passes >= PASSES.max}
            onClick={() => step(1)}
            className="size-[30px] disabled:opacity-40"
          >
            +
          </button>
        </span>
        {passes > 1 ? 'passes' : 'passe'} à
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Niveau"
              className={`${box} gap-1.5 pr-2 pl-2.5 tabular-nums`}
            >
              {level}/5
              <ChevronDown className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-24 min-w-0">
            {LEVELS.map((l) => (
              <DropdownMenuItem
                key={l}
                className="h-7 justify-between text-[12.5px] tabular-nums"
                onSelect={() => onChange({ passes, level: l })}
              >
                {l}/5
                {l === level && <Check className="size-3" strokeWidth={2.2} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  )
}
