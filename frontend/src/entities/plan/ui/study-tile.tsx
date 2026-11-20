import { BookOpen, Check, Play, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'
import { Chip } from '@/shared/ui'

import type { StudyTile, TileRow } from '../model/phase-focus'
import { RECALL_INTERVALS } from '../model/recall'
import { recallTargetLabel } from '../model/study'
import { PieceMark } from './skill-pieces'

type Colors = { base: string; ink: string }

/** Les gestes de la tuile Étude (#157) : l'entité ne connaît pas les
 *  features, l'appelant les branche. */
export interface StudyActions {
  /** « Lancer l'interro » : la modale de l'appelant. */
  onLaunch: () => void
  /** « Passer l'interro ». */
  onTake: () => void
  takePending?: boolean
  /** « Valider l'étude sans interro » (sans questions). */
  onValidate: () => void
  validatePending?: boolean
}

/**
 * La ligne Interro de la tuile Étude (#157, `kit/Phases cycle`) : état,
 * 🧠, « Interro », et à droite ce qui vient (`study.next`) ; dessous, dès
 * que la courbe est lancée, la frise J+1 → seuil — crans franchis pleins,
 * cran visé cerclé à l'encre du domaine.
 */
export function RecallTileRow({
  row,
  study,
  colors,
  onOpen,
}: {
  row: TileRow
  study: StudyTile
  colors: Colors
  /** Lecture : le clic sur la ligne (la fiche de l'interro). */
  onOpen?: () => void
}) {
  const fini = study.state === 'terminee'
  const launched = study.state !== 'nonlancee'
  const body = (
    <>
      <RowMark state={row.state} ink={colors.ink} />
      <span className="flex w-4 shrink-0 justify-center text-[13px]">
        <PieceMark piece={row.piece} colors={colors} />
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[12.5px]"
        style={row.state === 'done' ? { color: colors.ink } : undefined}
      >
        {row.title}
      </span>
      {study.next &&
        (study.late ? (
          <Chip tone="rose" className="shrink-0">
            {study.next}
          </Chip>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {study.next}
          </span>
        ))}
    </>
  )
  const line = 'flex min-h-7 w-full items-center gap-2 px-1.5 text-left'
  // La ligne et sa courbe forment un seul bloc : un seul contour au survol,
  // et tout le bloc ouvre la fiche (le contour de la seule ligne, ouvert en
  // bas sur la courbe, se lisait comme cassé).
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
      className={cn(
        'flex flex-col rounded-[7px] bg-card',
        onOpen &&
          'cursor-pointer outline-none hover:shadow-[inset_0_0_0_1px_var(--color-border)] focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]',
      )}
    >
      <div className={line}>{body}</div>
      {launched && (
        <ol
          aria-label="Courbe de l'interro"
          className="-mt-0.5 flex items-center pt-0.5 pr-2 pb-1.5 pl-[41px]"
        >
          {RECALL_INTERVALS.slice(0, study.target).map((days, j) => {
            const last = j === study.target - 1
            const reached = j < study.reached
            const aimed = j === study.reached && !fini
            return (
              <li
                key={days}
                aria-current={aimed ? 'step' : undefined}
                className="flex flex-1 flex-col items-start gap-[3px]"
              >
                <span className="flex w-full items-center">
                  <span
                    className={cn(
                      'size-[9px] shrink-0 rounded-full',
                      aimed
                        ? 'border-2 bg-card'
                        : !reached && 'border-[1.5px] border-border bg-card',
                    )}
                    style={
                      reached
                        ? { background: colors.ink }
                        : aimed
                          ? { borderColor: colors.ink }
                          : undefined
                    }
                  />
                  <span
                    className={cn('h-0.5 flex-1', !reached && 'bg-border')}
                    style={
                      last
                        ? { background: 'transparent' }
                        : reached
                          ? { background: colors.ink }
                          : undefined
                    }
                  />
                </span>
                <span
                  className={cn(
                    'text-[10.5px] text-muted-foreground tabular-nums',
                    aimed && 'font-semibold',
                  )}
                  style={aimed ? { color: colors.ink } : undefined}
                >
                  J+{days}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/** La pastille d'état de la ligne Interro : validée, des crans, aucun. */
function RowMark({ state, ink }: { state: TileRow['state']; ink: string }) {
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
  return (
    <span
      aria-hidden
      className={cn(
        'size-[13px] shrink-0 rounded-full border-[1.5px]',
        state === 'doing' ? 'border-foreground' : 'border-ring',
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
 * Les gestes de la tuile Étude, sur deux colonnes (`kit/Phases cycle`) :
 * pas lancée, Étudier + **Lancer l'interro** ; lancée, Étudier seul ; due,
 * Étudier + Passer l'interro ; sans questions, Étudier + Valider l'étude sans interro ;
 * terminée ou validée, rien. « Étudier » ouvre les notes.
 */
export function StudyGestures({
  study,
  onStudy,
  actions,
}: {
  study: StudyTile
  onStudy: () => void
  actions: StudyActions
}) {
  const s = study.state
  if (s === 'terminee' || s === 'validee') return null
  const second: ReactNode =
    s === 'nonlancee' ? (
      <Gesture primary onClick={actions.onLaunch}>
        <Zap /> Lancer l'interro
      </Gesture>
    ) : s === 'due' ? (
      <Gesture primary onClick={actions.onTake} pending={actions.takePending}>
        <Play className="size-[13px] fill-current" /> Passer l'interro
      </Gesture>
    ) : s === 'sans' ? (
      <Gesture
        primary
        onClick={actions.onValidate}
        pending={actions.validatePending}
      >
        <Check strokeWidth={2.2} /> Valider l'étude sans interro
      </Gesture>
    ) : null
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Gesture onClick={onStudy} wide={!second}>
        <BookOpen /> Étudier
      </Gesture>
      {second}
    </div>
  )
}

function Gesture({
  primary = false,
  wide = false,
  pending = false,
  onClick,
  children,
}: {
  primary?: boolean
  wide?: boolean
  pending?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold whitespace-nowrap disabled:opacity-60 [&_svg:not([class*=size-])]:size-3.5',
        primary
          ? 'bg-foreground text-background hover:bg-foreground/90'
          : 'border bg-card hover:bg-muted',
        wide && 'col-span-full',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Le seuil de l'Étude (#157, `kit/Phases cycle` en Modifier, aussi en
 * Nouveau cycle) : « Terminée à J+15 · 3 tests », puis la frise des cinq
 * crans, cliquable — un clic règle le seuil sur ce cran.
 */
export function RecallTargetControl({
  value,
  onChange,
  ink,
}: {
  /** Le nombre de tests (1 = J+1 … 5 = J+90). */
  value: number
  onChange: (target: number) => void
  /** L'encre du domaine (couleur CSS). */
  ink: string
}) {
  const n = value - 1
  const last = RECALL_INTERVALS.length - 1
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      <span className="text-xs font-semibold">{recallTargetLabel(value)}</span>
      <div className="flex items-center">
        {RECALL_INTERVALS.map((days, j) => (
          <button
            key={days}
            type="button"
            aria-pressed={j === n}
            onClick={() => onChange(j + 1)}
            className="relative flex flex-1 flex-col items-center gap-1"
          >
            <span
              aria-hidden
              className={cn(
                'absolute top-[5px] right-1/2 left-0 h-0.5',
                j > 0 && j > n && 'bg-border',
              )}
              style={
                j === 0 ? undefined : j <= n ? { background: ink } : undefined
              }
            />
            <span
              aria-hidden
              className={cn(
                'absolute top-[5px] right-0 left-1/2 h-0.5',
                j < last && j >= n && 'bg-border',
              )}
              style={j < last && j < n ? { background: ink } : undefined}
            />
            <span
              aria-hidden
              className={cn(
                'relative size-3 rounded-full',
                j > n && 'border-[1.5px] border-border bg-card',
              )}
              style={j <= n ? { background: ink } : undefined}
            />
            <span
              className={cn(
                'text-[11px] tabular-nums',
                j === n ? 'font-semibold' : 'text-muted-foreground',
              )}
              style={j === n ? { color: ink } : undefined}
            >
              J+{days}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
