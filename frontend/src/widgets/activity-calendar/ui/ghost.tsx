import type { Ghost } from '@/entities/activity-type'

import { cn } from '@/shared/lib/utils'

import { blockHeight, blockTop, isThinBlock } from '../model/constants'
import { type BlockDecoration, pillStyle } from '../model/decoration'
import {
  EXPANDED_SHADOW,
  isAlone,
  REVEAL_TRANSITION,
  type Lane,
  laneStyle,
  laneDensity,
} from '../model/overlap'

/**
 * Ce que la planification poserait, **pas encore posé** (#37, §6) : le vrai
 * dessin à 45 %, non modifiable, « pas encore posée » au survol. Aucun geste :
 * ni clic, ni glisser — il n'y a rien en base à ouvrir ou à déplacer.
 */
const ghostTitle = (g: Ghost) => `${g.title} · pas encore posée`

/** Le fantôme est déjà à 45 % : l'estompage d'un mode s'y multiplie. */
const GHOST_OPACITY = 0.45
const ghostOpacity = (d?: BlockDecoration) => GHOST_OPACITY * (d?.opacity ?? 1)

/**
 * Un bloc fantôme de la grille horaire. Il prend sa colonne parmi les
 * activités qu'il chevauche, comme un bloc réel (#55).
 */
export function GhostBlock({
  ghost,
  color,
  emoji,
  lane,
  expanded = false,
  behind = false,
  onHoverEnter,
  onHoverLeave,
  decoration,
}: {
  ghost: Ghost
  color: string
  emoji: string
  lane?: Lane
  expanded?: boolean
  /** Celui qui le porte est survolé : il s'efface pour le dévoiler. */
  behind?: boolean
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  /** Habillage d'un mode piloté — seule l'opacité vaut pour un fantôme. */
  decoration?: BlockDecoration
}) {
  // Seul sur son créneau, il ne se déplie pas : rien ne bouge au survol.
  const shown = expanded && !isAlone(lane)
  const cols = shown ? 1 : laneDensity(lane)
  const start = new Date(ghost.start_at)
  const end = new Date(ghost.end_at)
  const startH = start.getHours() + start.getMinutes() / 60
  const dur = Math.max(0.25, (end.getTime() - start.getTime()) / 3_600_000)
  const thin = isThinBlock(dur)
  return (
    <div
      title={ghostTitle(ghost)}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      className={cn(
        'absolute cursor-default text-xs',
        'overflow-hidden',
        REVEAL_TRANSITION,
        // Un quart d'heure : la ligne fine du bloc réel (titre et emoji
        // centrés, en 7,5 et 7 px), sur sa vraie hauteur.
        thin
          ? 'flex items-center gap-1 rounded-[4px] py-0 text-[7.5px] leading-[9px] [&>span:first-child]:text-[7px]'
          : 'rounded-md py-1',
        cols >= 4
          ? 'justify-center px-0 text-center'
          : thin
            ? 'px-[6px]'
            : 'px-1.5',
        cols === 3 && !thin && 'truncate',
      )}
      style={{
        top: blockTop(startH, dur),
        height: blockHeight(dur),
        background: color,
        opacity: ghostOpacity(decoration),
        ...laneStyle(lane, 3, shown),
        zIndex: shown && !lane?.host ? 30 : lane?.nested ? 15 : 6,
        ...(shown && { boxShadow: EXPANDED_SHADOW }),
        ...(behind && { opacity: 0, pointerEvents: 'none' }),
      }}
    >
      <span className={cn('shrink-0', cols < 4 && !thin && 'mr-1')}>
        {emoji}
      </span>
      {cols < 4 && (
        <span className={cn('font-medium', thin && 'min-w-0 truncate')}>
          {ghost.title}
        </span>
      )}
    </div>
  )
}

/** Une case du jour fantôme, dans la rangée des pastilles. */
export function GhostPill({
  ghost,
  color,
  emoji,
  size,
  decoration,
}: {
  ghost: Ghost
  color: string
  emoji: string
  size: number
  decoration?: BlockDecoration
}) {
  return (
    <span
      title={ghostTitle(ghost)}
      className="grid shrink-0 cursor-default place-items-center rounded-md"
      style={{
        width: size,
        height: size,
        background: color,
        ...pillStyle(decoration),
        opacity: ghostOpacity(decoration),
      }}
    >
      {emoji}
    </span>
  )
}
