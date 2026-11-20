import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ObjectiveFrame } from '@/entities/project'
import { TargetFlag } from '@/features/project/result'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

export type ObjectiveType = 'total' | 'result' | 'achievement' | 'learning'

/**
 * Une carte neuve, dont on choisit d'abord le **type** (design #27) : trois
 * tuiles avec aperçu, dans l'ordre des cartes (design #36) — Total,
 * Apprentissage, Résultat, Réalisation. Une fois choisi, le type est figé — on supprime la
 * carte, on ne la change pas. L'Apprentissage n'est proposé qu'à la création,
 * une seule fois par projet (design #33) : sur la page, les savoirs visés se
 * règlent dans le plan.
 */
const LEARNING_PREVIEW = [
  'ink',
  'ink',
  'dot',
  'blank',
  'blank',
  'blank',
  'ink',
  'dot',
  'blank',
  'blank',
  'blank',
  'blank',
] as const

export function TypeChooserCard({
  softClassName,
  dotClassName,
  ringClassName,
  inkClassName,
  learning = false,
  onPick,
  onDiscard,
}: {
  softClassName: string
  dotClassName: string
  /** `domainColor(...).ring` — le bord du rond du record, dans l'aperçu. */
  ringClassName: string
  inkClassName: string
  /** Propose la tuile Apprentissage (création, aucune autre carte ne l'a). */
  learning?: boolean
  onPick: (type: ObjectiveType) => void
  onDiscard: () => void
}) {
  const [open, setOpen] = useState(true)
  const preview = cn(
    'flex h-[52px] items-center rounded-md border-0 px-2.5',
    softClassName,
  )
  const tiles: { type: ObjectiveType; label: string; body: React.ReactNode }[] =
    [
      {
        type: 'total',
        label: 'Total',
        body: (
          <div className={preview}>
            <span className="flex w-full flex-col gap-1.5">
              <span className="flex items-baseline gap-1 text-xs text-foreground">
                <span className="font-bold">200</span>
                <span className="text-muted-foreground">h</span>
              </span>
              <span className="flex h-[5px] overflow-hidden rounded-full bg-white">
                <span className={cn('w-2/5', dotClassName)} />
              </span>
            </span>
          </div>
        ),
      },
      ...(learning
        ? [
            {
              type: 'learning' as const,
              label: 'Apprentissage',
              body: (
                <div className={preview}>
                  {/* Deux rangées de six crans : acquis, en cours, à venir. */}
                  <span className="grid grid-cols-[repeat(6,9px)] gap-[3px]">
                    {LEARNING_PREVIEW.map((tone, i) => (
                      <span
                        key={i}
                        className={cn(
                          'size-[9px] rounded-[2px]',
                          tone === 'ink' && inkClassName,
                          tone === 'dot' && cn(dotClassName, 'opacity-50'),
                          tone === 'blank' && 'bg-white',
                        )}
                      />
                    ))}
                  </span>
                </div>
              ),
            },
          ]
        : []),
      {
        type: 'result',
        label: 'Résultat',
        body: (
          <div className={preview}>
            <span className="relative h-[22px] w-full">
              {/* Le trait s'arrête 10 px avant le drapeau. */}
              <span className="absolute left-0 right-2.5 top-[9px] h-px bg-ring" />
              <span
                className={cn(
                  'absolute left-0 top-2 h-[3px] w-[45%] rounded-sm',
                  dotClassName,
                )}
              />
              <span
                className={cn(
                  'absolute left-[45%] top-[5px] size-[9px] -translate-x-1/2 rounded-full bg-white ring-2 ring-inset',
                  ringClassName,
                )}
              />
              <TargetFlag className="absolute right-0 top-0.5 size-3.5 text-zinc-600" />
            </span>
          </div>
        ),
      },
      {
        type: 'achievement',
        label: 'Réalisation',
        body: (
          <div className={cn(preview, 'gap-2')}>
            <span className="grid size-[26px] place-items-center rounded-md bg-white text-sm">
              📦
            </span>
            <span
              className={cn(
                'grid size-[15px] place-items-center rounded-full text-white',
                inkClassName,
              )}
            >
              <Check className="size-2.5" strokeWidth={3.5} />
            </span>
          </div>
        ),
      },
    ]

  return (
    // Une carte neuve : pas de survol, la corbeille toujours en vue.
    <ObjectiveFrame>
      <div className="flex items-center gap-[9px]">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="-ml-1.5 inline-flex h-6 items-center gap-0.5 rounded-[5px] bg-muted px-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-foreground"
            >
              Type d'objectif
              <ChevronDown className="size-3" strokeWidth={2.5} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={cn(
              'grid w-auto gap-1.5 rounded-xl p-2 shadow-[0_12px_32px_-8px_oklch(0.21_0.008_285/0.22)]',
              learning
                ? 'grid-cols-[repeat(4,112px)]'
                : 'grid-cols-[repeat(3,112px)]',
            )}
          >
            {tiles.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onPick(t.type)
                }}
                className="grid gap-2 rounded-[9px] border border-transparent p-1.5 text-left hover:border-zinc-300 hover:bg-muted/40"
              >
                {t.body}
                <span className="font-heading text-[13px] font-semibold">
                  {t.label}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Retirer cet objectif"
          className="ml-auto grid size-6 place-items-center rounded-md text-red-700 hover:bg-red-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </ObjectiveFrame>
  )
}
