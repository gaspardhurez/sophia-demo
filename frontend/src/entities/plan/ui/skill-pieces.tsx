import { ArrowUpRight, Check } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'

import type { Piece, PiecePhase } from '../model/pieces'
import { CriterionPips } from './criterion-pips'

type Colors = { base: string; ink: string; fonce: string }

/** Le temps de survol avant que les pièces se déroulent : la souris qui ne
 *  fait que traverser le savoir (vers « Passer l'interro », le suivant…) ne
 *  le déplie pas. */
const UNFOLD_MS = 150

const mix = (color: string, pct: number) =>
  `color-mix(in oklab, ${color} ${pct}%, transparent)`

const PHASE_LABEL: Record<PiecePhase, string> = {
  study: 'Étude',
  isolated: 'Pratique',
  situation: 'Mise en situation',
}
const PHASE_ORDER: PiecePhase[] = ['study', 'isolated', 'situation']

/**
 * Les **pièces d'un savoir** (#108, `kit/Pieces savoir`), en préparation et
 * dans le panneau d'activité.
 *
 * En lecture : le nom du savoir, sa jauge, puis seulement ce qui est posé
 * (et la pièce armée). Au survol (150 ms, pas au passage ; jamais sur une
 * action de la lecture), la lecture se replie et les pièces se
 * déroulent, par phase : un filet gris à gauche, le titre en petites
 * capitales — qui **est** la pièce de sa phase (#109) : l'Étude, la Pratique
 * et la Mise en situation génériques ; l'Interro et les objets dessous. Pas de carte
 * ni de fond : le savoir se déplie dans le fond de son conteneur.
 *
 * - `preparation` : la jauge (`gauge`) suit le nom ; `posed` dit le jour
 *   (« lun. 12 · 19:00 ») ; une pièce posée montre sa pilule, un clic arme
 *   l'aimant (`armed` replie le savoir). Un objet qui a un critère montre
 *   ses pastilles (`criteria`, 30/10), posé comme déplié.
 * - `panel` (#109) : la jauge, verticale, tient la marge ; au survol, ↗ en
 *   bout de nom (`onOpenSkill`) et le cycle sous le nom ; une pièce posée a sa
 *   coche, ↗ (`pieceLink`) et « × » au survol ; un clic ajoute ou retire.
 *   Sur une séance faite (#139), une ligne de lecture porte le retour de sa
 *   passe (`afterTitle`, `lineEnd`, `onRead`). Au panneau, la lecture ne
 *   déplie plus le savoir (`foldOnName`, séance faite ou non depuis le
 *   24/10/2026) : seul son nom le fait.
 */
export function SkillPieces({
  name,
  gauge,
  cycle,
  planned = false,
  level,
  pieces,
  mode,
  posed,
  armed = null,
  colors,
  onPick,
  onHover,
  below,
  dueBy,
  onOpenSkill,
  pieceLink,
  unfold = 0,
  afterTitle,
  lineEnd,
  onRead,
  foldOnName = false,
  criteria = false,
}: {
  name: string
  /** La jauge qui suit le nom (préparation) ; le panneau dessine la sienne,
   *  verticale, dans la marge. */
  gauge?: ReactNode
  /** Le nom du cycle, en gris, sous le nom au survol (panneau). */
  cycle?: string
  /** Le savoir n'est pas démarré : « Prévu ». */
  planned?: boolean
  level: number
  pieces: Piece[]
  mode: 'preparation' | 'panel'
  /** Les pièces posées, par clé : le jour (préparation) ou `true`. */
  posed: Map<string, string | true>
  /** La pièce armée (préparation). */
  armed?: string | null
  colors: Colors
  onPick: (piece: Piece) => void
  onHover?: (piece: Piece | null) => void
  /** Sous une ligne de lecture : « Passer l'interro » dans le panneau. */
  below?: (piece: Piece) => ReactNode
  /** L'interro est « Dû » (en rouge) si elle tombe au plus tard ce jour-là
   *  — le jour de la séance, dans le panneau ; plus tard, sa date en gris.
   *  Sans jour, toujours « Dû » (la préparation : due dans la semaine). */
  dueBy?: Date
  /** ↗ en bout de nom, au survol (panneau) : la page du savoir. */
  onOpenSkill?: () => void
  /** ↗ d'une pièce posée, au survol (panneau) : les notes pour l'Étude,
   *  l'exercice pour un objet ; rien pour l'Interro. */
  pieceLink?: (piece: Piece) => { label: string; open: () => void } | null
  /** Change à chaque fois que le savoir vient d'être choisi dans le
   *  sélecteur : ses pièces se déplient, comme au survol (elles se replient
   *  quand la souris le quitte). */
  unfold?: number
  /** Juste après le titre d'une ligne de lecture (le « + retour » au
   *  survol de la ligne). */
  afterTitle?: (piece: Piece) => ReactNode
  /** Au bout d'une ligne de lecture (la chip du niveau). */
  lineEnd?: (piece: Piece) => ReactNode
  /** Un clic sur le bloc d'une ligne de lecture (ligne et dessous) : il
   *  grise au survol. Nul : le bloc ne se clique pas. */
  onRead?: (piece: Piece) => (() => void) | undefined
  /** Survoler la lecture ne déplie pas le savoir ; son nom, si. */
  foldOnName?: boolean
  /** Les pastilles du critère d'un objet (préparation). */
  criteria?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [unfolded, setUnfolded] = useState(unfold)
  if (unfold !== unfolded) {
    setUnfolded(unfold)
    if (unfold) setHovered(true)
  }
  const [row, setRow] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const cancel = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => cancel, [])
  // Ce qui suit une pièce en lecture (`below` : « Passer l'interro ») est une
  // action : la souris dessus ne déplie pas le savoir, sinon il se déroule et
  // le bouton s'en va sous elle.
  const hover = (target: EventTarget) => {
    if (hovered) return
    if ((target as Element).closest('[data-keep-folded]')) return cancel()
    if (foldOnName && (target as Element).closest('[data-read]'))
      return cancel()
    if (timer.current === undefined)
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        setHovered(true)
      }, UNFOLD_MS)
  }
  const panel = mode === 'panel'
  const open = hovered && !armed
  const any = pieces.some((p) => posed.has(p.key))
  const armStyle = {
    background: mix(colors.base, 10),
    boxShadow: `inset 0 0 0 2px ${colors.base}`,
  }

  const enter = (p: Piece) => {
    setRow(p.key)
    onHover?.(p)
  }
  const leave = () => {
    setRow(null)
    onHover?.(null)
  }
  const day = (p: Piece) => {
    const v = posed.get(p.key)
    return typeof v === 'string' ? v : ''
  }

  /** À droite d'une pièce dépliée : sa pilule ou sa coche, « + » / « × »
   *  au survol. */
  function trail(p: Piece) {
    const on = posed.has(p.key)
    const isArmed = armed === p.key
    const link = panel && on ? pieceLink?.(p) : null
    if (row === p.key && !isArmed)
      return (
        <>
          {link && (
            <span
              role="button"
              tabIndex={-1}
              title={link.label}
              aria-label={link.label}
              onClick={(e) => {
                e.stopPropagation()
                link.open()
              }}
              className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <ArrowUpRight className="size-[13px]" />
            </span>
          )}
          <span className="w-3.5 text-center text-[15px] leading-none text-muted-foreground">
            {panel && on ? '×' : '+'}
          </span>
        </>
      )
    if (on && !panel)
      return (
        <span
          className="rounded px-1.5 py-px text-[11px] font-medium whitespace-nowrap"
          style={{ background: mix(colors.base, 15), color: colors.fonce }}
        >
          {day(p).split(' · ')[0]}
        </span>
      )
    if (on && panel)
      return (
        <Check
          className="size-[13px]"
          strokeWidth={2.6}
          style={{ color: colors.ink }}
        />
      )
    return null
  }

  const pips = (p: Piece) =>
    criteria &&
    p.criterion && (
      <CriterionPips
        variant="tile"
        passes={p.criterion.passes}
        level={p.criterion.level}
        reached={p.criterion.reached}
        ink={colors.ink}
      />
    )

  const read = pieces.filter((p) => posed.has(p.key) || armed === p.key)
  const phases = PHASE_ORDER.map((phase) => ({
    phase,
    all: pieces.filter((p) => p.phase === phase),
  })).filter((x) => x.all.length > 0)

  return (
    <div
      className="flex min-w-0 text-[13px]"
      onMouseMove={(e) => hover(e.target)}
      onMouseLeave={() => {
        cancel()
        setHovered(false)
        leave()
      }}
    >
      {panel && <VerticalGauge level={level} colors={colors} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[22px] min-w-0 items-center gap-2">
          <span
            className={cn(
              'min-w-0 truncate font-medium',
              !any && !open && 'text-muted-foreground',
            )}
            title={name}
          >
            {name}
          </span>
          {!panel && gauge}
          {planned && (
            <span className="shrink-0 rounded-[3px] bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              Prévu
            </span>
          )}
          {panel && open && onOpenSkill && (
            <button
              type="button"
              title="Ouvrir le savoir"
              aria-label="Ouvrir le savoir"
              onClick={(e) => {
                e.stopPropagation()
                onOpenSkill()
              }}
              className="ml-auto grid size-[22px] shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
            </button>
          )}
        </div>

        <Fold open={!open}>
          <div data-read className="flex flex-col gap-0.5 pt-0.5">
            {read.map((p) => {
              const click = onRead?.(p)
              return (
                <div
                  key={p.key}
                  onClick={click}
                  className={cn(
                    'group/read flex flex-col',
                    click &&
                      '-mx-1.5 cursor-pointer rounded-[7px] px-1.5 hover:bg-muted/60',
                  )}
                >
                  <div
                    className={cn(
                      'flex min-h-[22px] items-center gap-[7px]',
                      panel && 'text-xs text-foreground/75',
                      armed === p.key && '-mx-1.5 rounded-md px-1.5',
                    )}
                    style={{
                      ...(panel ? {} : { color: colors.fonce }),
                      ...(armed === p.key ? armStyle : {}),
                    }}
                  >
                    <PieceMark piece={p} colors={colors} />
                    <span className="min-w-0 truncate">{p.title}</span>
                    {afterTitle?.(p)}
                    <span className="flex-1" />
                    {lineEnd?.(p)}
                    {pips(p)}
                    {!panel && posed.has(p.key) && (
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {day(p)}
                      </span>
                    )}
                  </div>
                  <div data-keep-folded>{below?.(p)}</div>
                </div>
              )
            })}
          </div>
        </Fold>

        <Fold open={open} slow>
          <div className="flex flex-col gap-2 pt-1.5">
            {panel && cycle && (
              <span className="-mt-1.5 truncate text-[11px] text-muted-foreground">
                {cycle}
              </span>
            )}
            {phases.length === 0 && (
              // Un cycle sans phase activée n'a rien à poser : le dire, plutôt
              // qu'un survol qui ne déplie rien.
              <p className="text-xs text-muted-foreground">
                Aucune phase activée dans ce cycle
              </p>
            )}
            {phases.map(({ phase, all }) => {
              // Le titre de la phase est sa pièce : l'Étude, la générique.
              const generic = all.find((p) => p.head)
              // Gris, sauf posée : ici on choisit, la phase où en est le
              // savoir n'a rien à dire (la jauge la porte).
              const head =
                generic && posed.has(generic.key) ? colors.fonce : undefined
              return (
                <div
                  key={phase}
                  className="flex flex-col gap-px pl-2.5"
                  style={{ borderLeft: '2px solid var(--color-border)' }}
                >
                  <button
                    type="button"
                    disabled={!generic}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (generic) onPick(generic)
                    }}
                    onMouseEnter={() => generic && enter(generic)}
                    onMouseLeave={leave}
                    className={cn(
                      '-ml-1.5 mb-px flex min-h-[22px] items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 text-left',
                      generic
                        ? 'cursor-pointer hover:bg-muted/60'
                        : 'cursor-default',
                      !head && 'text-muted-foreground',
                    )}
                    style={{
                      color:
                        generic && armed === generic.key ? colors.fonce : head,
                      ...(generic && armed === generic.key ? armStyle : {}),
                    }}
                  >
                    <span className="text-[10px] font-semibold tracking-[.06em] uppercase">
                      {PHASE_LABEL[phase]}
                    </span>
                    <span className="flex-1" />
                    {generic && trail(generic)}
                  </button>
                  {all
                    .filter((p) => !p.head)
                    .map((p) => {
                      const on = posed.has(p.key)
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPick(p)
                          }}
                          onMouseEnter={() => enter(p)}
                          onMouseLeave={leave}
                          className="-ml-1.5 flex min-h-[26px] items-center gap-[7px] rounded-md px-1.5 py-0.5 text-left text-[13px] hover:bg-muted/60"
                          style={armed === p.key ? armStyle : undefined}
                        >
                          <span className="w-4 shrink-0 text-center leading-none">
                            {p.emoji}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 truncate',
                              p.done && !on && 'text-muted-foreground',
                              on && 'font-medium',
                            )}
                            style={on ? { color: colors.fonce } : undefined}
                          >
                            {p.title}
                          </span>
                          <span className="flex-1" />
                          {p.due &&
                            !on &&
                            (!dueBy || p.due <= dueBy ? (
                              <span className="text-xs whitespace-nowrap text-red-600">
                                Dû {shortDay(p.due)}
                              </span>
                            ) : (
                              <span className="text-xs whitespace-nowrap text-muted-foreground">
                                {shortDay(p.due)}
                              </span>
                            ))}
                          {pips(p)}
                          {trail(p)}
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </Fold>
      </div>
    </div>
  )
}

/** La jauge du savoir dans la marge du panneau (#109) : quatre barres
 *  verticales de 2,5 × 14, à la place d'une icône de section. */
function VerticalGauge({ level, colors }: { level: number; colors: Colors }) {
  return (
    <span
      aria-label={`Niveau ${level}/4`}
      className="mr-2.5 flex h-[22px] w-4 shrink-0 items-center justify-center gap-[1.5px]"
    >
      {[1, 2, 3, 4].map((k) => (
        <span
          key={k}
          className="h-3.5 w-[2.5px] rounded-[1px]"
          style={{
            background:
              level >= 4 || k < level
                ? colors.ink
                : k === level
                  ? mix(colors.base, 35)
                  : 'var(--color-border)',
          }}
        />
      ))}
    </span>
  )
}

/** Ce qui se déroule (hauteur et fondu) : la lecture, ou les pièces. */
function Fold({
  open,
  slow = false,
  children,
}: {
  open: boolean
  slow?: boolean
  children: ReactNode
}) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: slow
          ? 'grid-template-rows .3s cubic-bezier(.2,.7,.2,1), opacity .22s'
          : 'grid-template-rows .26s cubic-bezier(.2,.7,.2,1), opacity .18s',
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** L'emoji d'une pièce ; pour une générique, sa mini-jauge (sa phase
 *  pleine). */
export function PieceMark({
  piece,
  colors,
}: {
  piece: Pick<Piece, 'generic' | 'phase' | 'emoji'>
  colors: Pick<Colors, 'ink'>
}) {
  if (!piece.generic)
    return (
      <span className="w-4 shrink-0 text-center leading-none">
        {piece.emoji}
      </span>
    )
  const full = PHASE_ORDER.indexOf(piece.phase)
  return (
    <span className="flex w-4 shrink-0 justify-center gap-0.5">
      {PHASE_ORDER.map((p, k) => (
        <span
          key={p}
          className="h-2.5 w-[3px] rounded-[1px]"
          style={{
            background: k === full ? colors.ink : 'var(--color-border)',
          }}
        />
      ))}
    </span>
  )
}

/** « jeu. 15 ». */
function shortDay(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
}
