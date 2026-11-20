import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, RefreshCw, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

import type { TileRow, TileRowState } from '../model/phase-focus'
import { CriterionPips } from './criterion-pips'
import { PieceMark } from './skill-pieces'

type Colors = { base: string; ink: string }

const mix = (color: string, pct: number) =>
  `color-mix(in oklab, ${color} ${pct}%, transparent)`

/**
 * Une ligne d'une tuile de phase (#136, #142, `kit/Phases cycle`) : état,
 * emoji (mini-jauge pour une générique), titre.
 *
 * Lecture : au bout, une pastille par passe du critère (#157) pour un objet
 * de Pratique ou de Mise en situation ; sinon le dernier niveau en chip
 * (#139, `renderLevel`) ou, à défaut, « 3 fois ». Toute la ligne se clique. Modifier : ni nombre de fois
 * ni niveau ; poignée devant (`handle`), rétention et × derrière (`actions`).
 */
export function PhaseTileRow({
  row,
  colors,
  onOpen,
  renderLevel,
  handle,
  actions,
}: {
  row: TileRow
  colors: Colors
  /** Lecture : le clic sur la ligne. */
  onOpen?: () => void
  renderLevel?: (level: number) => ReactNode
  handle?: ReactNode
  actions?: ReactNode
}) {
  const editing = !onOpen
  const tip = `${row.title} · ${
    row.state === 'kept'
      ? 'Gardé'
      : row.passes === 0
        ? 'Jamais fait'
        : `${row.passes} fois`
  }`
  const body = (
    <>
      {handle}
      <StateMark state={row.state} ink={colors.ink} />
      <span className="flex w-4 shrink-0 justify-center text-[13px]">
        <PieceMark piece={row.piece} colors={colors} />
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[12.5px]',
          row.state === 'todo' && 'text-foreground/70',
        )}
        style={
          row.state === 'done' || row.inked ? { color: colors.ink } : undefined
        }
      >
        {row.title}
      </span>
      {!editing &&
        (row.criterion ? (
          <CriterionPips
            variant="tile"
            passes={row.criterion.passes}
            level={row.criterion.level}
            reached={row.criterion.reached}
            ink={colors.ink}
            times={row.passes}
          />
        ) : row.level != null && renderLevel ? (
          renderLevel(row.level)
        ) : (
          row.passes > 0 && (
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {row.passes} fois
            </span>
          )
        ))}
      {actions}
    </>
  )
  const box =
    'flex min-h-7 w-full items-center gap-2 rounded-[7px] bg-card px-1.5 text-left hover:shadow-[inset_0_0_0_1px_var(--color-border)]'
  return onOpen ? (
    <button type="button" title={tip} onClick={onOpen} className={box}>
      {body}
    </button>
  ) : (
    <div
      title={tip}
      className={cn(box, handle ? 'cursor-grab' : 'cursor-default')}
    >
      {body}
    </div>
  )
}

/** La pastille d'état de 13 px, devant l'emoji. */
function StateMark({ state, ink }: { state: TileRowState; ink: string }) {
  if (state === 'done')
    return (
      <span
        aria-label="Validée"
        className="grid size-[13px] shrink-0 place-items-center rounded-full text-[8px] text-white"
        style={{ background: ink }}
      >
        ✓
      </span>
    )
  // La générique ne se valide pas : la place, sans pastille.
  if (state === 'generic')
    return <span aria-hidden className="size-[13px] shrink-0" />
  return (
    <span
      aria-hidden
      className={cn(
        'size-[13px] shrink-0 rounded-full border-[1.5px]',
        state === 'doing'
          ? 'border-foreground'
          : state === 'todo'
            ? 'border-ring'
            : 'border-dashed border-ring/70',
      )}
      style={
        state === 'doing'
          ? {
              background:
                'conic-gradient(var(--foreground) 0 50%, transparent 50% 100%)',
            }
          : undefined
      }
    />
  )
}

/**
 * Les gestes d'une ligne en Modifier : l'icône de rétention (allumée, à la
 * teinte du domaine, si gardé) et, hors Rétention, × « Retirer du cycle ».
 */
export function RowActions({
  kept,
  colors,
  inRetention,
  onKeep,
  onRemove,
}: {
  kept: boolean
  colors: Colors
  /** La ligne est dans la tuile Rétention : un clic l'en retire. */
  inRetention: boolean
  onKeep: () => void
  onRemove?: () => void
}) {
  const keepLabel = inRetention
    ? 'Retirer de la rétention'
    : kept
      ? 'Gardé en rétention'
      : 'Garder en rétention'
  return (
    <span className="flex shrink-0 gap-0.5">
      <button
        type="button"
        title={keepLabel}
        aria-label={keepLabel}
        aria-pressed={kept}
        onClick={onKeep}
        className={cn(
          'grid size-[22px] place-items-center rounded-[5px]',
          !kept && 'text-muted-foreground hover:bg-muted',
        )}
        style={
          kept
            ? { background: mix(colors.base, 15), color: colors.ink }
            : undefined
        }
      >
        <RefreshCw className="size-[13px]" strokeWidth={2.2} />
      </button>
      {onRemove && (
        <button
          type="button"
          title="Retirer du cycle"
          aria-label="Retirer du cycle"
          onClick={onRemove}
          className="grid size-[22px] place-items-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-[13px]" strokeWidth={2.2} />
        </button>
      )}
    </span>
  )
}

/** Une ligne réordonnable : le conteneur qui se déplace, et sa poignée. */
export function SortableTileRow({
  id,
  children,
}: {
  id: string
  children: (handle: ReactNode) => ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  // La poignée, et elle seule, prend le glisser : les boutons de droite
  // restent visables.
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      title="Glisser pour réordonner"
      aria-label="Réordonner"
      className="-ml-0.5 grid h-7 w-3 shrink-0 cursor-grab touch-none place-items-center text-ring hover:text-muted-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-3" />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10 opacity-60')}
    >
      {children(handle)}
    </div>
  )
}
