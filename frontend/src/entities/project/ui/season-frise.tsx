import { type CSSProperties, Fragment, useMemo, useState } from 'react'

import { cn } from '@/shared/lib/utils'
import { useElementWidth } from '@/shared/lib/use-element-width'
import { shortDay } from '@/shared/ui'

import {
  type Frise,
  LABEL_GAP,
  placeBars,
  type SeasonBar,
  type SeasonKind,
} from '../model/frise'

const ROW = 24
const GAP = 4
/** Les marges du nom dans la barre (`px-2`). */
const PAD = 16

/**
 * Les teintes d'une rangée, en valeurs CSS (`domainColorValues`) : une entité
 * ne connaît pas le domaine, l'appelant les lui passe.
 */
export interface SeasonColors {
  /** La base (500) : fond d'une barre en cours, bord d'une barre à venir. */
  base: string
  /** L'encre (700) : le cerne de la barre choisie ou survolée. */
  ink: string
}

function barStyle(kind: SeasonKind, c: SeasonColors): CSSProperties {
  if (kind === 'current')
    return {
      background: `color-mix(in oklab, ${c.base} 25%, transparent)`,
    }
  if (kind === 'upcoming')
    return {
      background: 'var(--card)',
      border: `1px dashed ${c.base}`,
    }
  return {}
}

let canvas: HTMLCanvasElement | null = null
/** La largeur d'un nom de barre (11 px, semi-gras), en px. */
function measureTitle(title: string): number {
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`
  return ctx.measureText(title).width
}

const barTitle = (b: SeasonBar) =>
  b.openSince ? `${b.title} · depuis le ${shortDay(b.openSince)}` : b.title

/**
 * La piste d'une frise : filets de mois, une barre par projet, trait
 * d'aujourd'hui. Un clic sur une barre la choisit, un second la relâche ; qui
 * l'affiche tient la sélection.
 *
 * Une barre trop courte pour son nom reste vide et le nom s'écrit à côté
 * (design #206) : à droite, ou à gauche s'il sortirait de l'année. Le nom se
 * clique et se survole comme sa barre. La largeur réelle de la piste et des
 * noms en décide, recalculée au redimensionnement.
 */
export function SeasonTrack({
  frise,
  colors,
  textClassName,
  selectedId,
  onSelect,
  hoveredId: sharedHover,
  onHover,
  className,
}: {
  frise: Frise
  colors: SeasonColors
  /** Le texte des barres ouvertes, dans la teinte (clair comme sombre). */
  textClassName: string
  selectedId: string | null
  onSelect: (projectId: string | null) => void
  /** Le survol tenu par l'appelant, partagé entre plusieurs pistes : un
   *  projet dans plusieurs domaines s'allume dans chacune (#203). */
  hoveredId?: string | null
  onHover?: (projectId: string | null) => void
  className?: string
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [ownHover, setOwnHover] = useState<string | null>(null)
  const hoveredId = sharedHover !== undefined ? sharedHover : ownHover
  const setHoveredId = onHover ?? setOwnHover
  const { bars, lanes } = useMemo(() => {
    // Avant la mesure : en % de l'année, chaque nom dans sa barre.
    if (width <= 0)
      return placeBars(
        frise.bars,
        100,
        () => 0,
        () => 0,
      )
    const text = new Map(frise.bars.map((b) => [b.id, measureTitle(b.title)]))
    return placeBars(
      frise.bars,
      width,
      (b) => (text.get(b.id) ?? 0) + PAD,
      (b) => text.get(b.id) ?? 0,
    )
  }, [frise.bars, width])

  // Une piste sans barre garde la hauteur d'une rangée : les filets de mois
  // et le trait d'aujourd'hui continuent d'une rangée à l'autre.
  const height = Math.max(1, lanes) * (ROW + GAP) - GAP
  return (
    <div ref={ref} className={cn('relative', className)} style={{ height }}>
      {frise.months.map((m) => (
        <div
          key={m.label}
          aria-hidden
          className="absolute inset-y-0 border-l border-dashed border-border/70"
          style={{ left: `${m.x}%` }}
        />
      ))}
      {bars.map((b) => {
        const lit = selectedId === b.id || hoveredId === b.id
        const hover = {
          onClick: () => onSelect(selectedId === b.id ? null : b.id),
          onMouseEnter: () => setHoveredId(b.id),
          onMouseLeave: () => setHoveredId(null),
        }
        const text =
          b.kind === 'closed' ? 'text-muted-foreground' : textClassName
        return (
          <Fragment key={b.id}>
            <button
              type="button"
              title={barTitle(b)}
              aria-label={b.label === 'inside' ? undefined : b.title}
              aria-pressed={selectedId === b.id}
              {...hover}
              className={cn(
                'absolute flex items-center rounded-md px-2 text-left text-[11px] font-semibold whitespace-nowrap transition-shadow',
                b.kind === 'closed' && 'bg-muted',
                text,
              )}
              style={{
                top: b.lane * (ROW + GAP),
                left: `${b.x}%`,
                width: `${b.w}%`,
                height: ROW,
                ...barStyle(b.kind, colors),
                // Sans fin (#196) : coin droit carré, bord droit en pointillé.
                ...(b.openSince && {
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  borderRight: `2px dashed ${colors.ink}`,
                }),
                ...(lit && { boxShadow: `inset 0 0 0 1.5px ${colors.ink}` }),
              }}
            >
              {b.label === 'inside' && (
                <span className="truncate">{b.title}</span>
              )}
            </button>
            {b.label !== 'inside' && (
              // Le nom à côté : même clic, même survol ; la barre porte déjà
              // le nom pour les lecteurs d'écran.
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                title={barTitle(b)}
                {...hover}
                className={cn(
                  'absolute flex items-center text-[11px] font-semibold whitespace-nowrap',
                  text,
                  hoveredId === b.id && 'underline',
                )}
                style={{
                  top: b.lane * (ROW + GAP),
                  height: ROW,
                  ...(b.label === 'right'
                    ? { left: `calc(${b.x + b.w}% + ${LABEL_GAP}px)` }
                    : { right: `calc(${100 - b.x}% + ${LABEL_GAP}px)` }),
                }}
              >
                {b.title}
              </button>
            )}
          </Fragment>
        )
      })}
      {frise.today !== null && (
        <div
          aria-hidden
          className="absolute -top-1 -bottom-1 w-0.5 bg-foreground/40"
          style={{ left: `${frise.today}%` }}
        />
      )}
    </div>
  )
}

/** Les noms des mois, calés sur les filets de la piste. */
export function SeasonMonths({
  frise,
  className,
}: {
  frise: Frise
  className?: string
}) {
  return (
    <div className={cn('relative h-3.5', className)} aria-hidden>
      {frise.months.map((m) => (
        <span
          key={m.label}
          className="absolute pl-1 text-[10px] text-muted-foreground"
          style={{ left: `${m.x}%` }}
        >
          {m.label}
        </span>
      ))}
    </div>
  )
}

/**
 * La frise des saisons (design #51, `prod/Domaine`) : l'année et les
 * projets d'un domaine, les mois dessous. Un clic sur une barre ne garde
 * qu'elle dans la liste des projets ; un second clic revient au défaut. La
 * page tient la sélection. L'accueil (#52) compose les mêmes pièces, une
 * piste par domaine sous une seule rangée de mois.
 */
export function SeasonFrise({
  frise,
  colors,
  textClassName,
  selectedId,
  onSelect,
}: {
  frise: Frise
  colors: SeasonColors
  textClassName: string
  selectedId: string | null
  onSelect: (projectId: string | null) => void
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <SeasonTrack
        frise={frise}
        colors={colors}
        textClassName={textClassName}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <SeasonMonths frise={frise} />
    </div>
  )
}
