import { useDraggable, useDroppable } from '@dnd-kit/core'

import { type Activity, OVERDUE_RING } from '@/entities/activity'
import { useSelectOrToggle } from '@/features/activity/edit'
import { cn } from '@/shared/lib/utils'
import {
  DoneMark,
  MissedMark,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui'

import { FROZEN_CLASS } from '../model/decoration'
import { AllDayBody, CardCheck, CHECK_BUTTON } from './card-body'

/**
 * Pastille de la rangée « jour » — forme **unique** de cette rangée, quelle que
 * soit la nature de ce qu'elle porte : case du jour d'une activité type comme
 * activité libre d'un seul jour. Un carré, une couleur de domaine, un emoji.
 *
 * Convention du calendrier, et non celle de la to-do : **clic = ouvrir le
 * panneau**, comme pour toute autre activité de la grille. Cocher se fait
 * depuis le panneau ou depuis la to-do de l'accueil.
 *
 * **Faite, elle ne change pas de fond** : c'est `DoneMark` en coin qui le dit.
 * Le fond densifié le disait avant, et se lisait comme une mise en avant — rien
 * n'indiquait lequel des deux fonds était l'accompli. Il révélait en prime la
 * frange de l'emoji, assez pour qu'on la prenne pour de la pixelisation.
 */
export function DailyPill({
  activity,
  color,
  inkClassName,
  emoji,
  missed,
  greyed = false,
  overdue,
  dragging,
  selected,
  onSelect,
  onToggleDone,
  onShiftSelect,
  onContextMenu,
  panelOpen,
  onClosePanel,
  size,
  frozen = false,
}: {
  activity: Activity
  color: string
  /** Encre du domaine pour la coche (`domainColor(...).ink`). */
  inkClassName?: string
  emoji: string
  /** Ratée (non faite, jour révolu) : la croix grise en coin. */
  missed: boolean
  /** Fond gris et emoji grisé (une ratée hors focus). */
  greyed?: boolean
  /** Interro en retard (#84) : jamais ratée, un liseré rouge à la place. */
  overdue?: boolean
  dragging: boolean
  selected: boolean
  onSelect: (rect: DOMRect) => void
  onToggleDone: () => void
  /** Maj + clic : ajouter ou retirer de la sélection (absent : pas de
   *  sélection, comme pendant une liaison). */
  onShiftSelect?: () => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Le panneau est ouvert **sur cette activité** — cf. `useSelectOrToggle`. */
  panelOpen?: boolean
  /** Referme le panneau — un double-clic lent ne doit rien laisser ouvert. */
  onClosePanel?: () => void
  /** Côté du créneau, calculé par la rangée pour remplir la colonne. Carré :
   *  la largeur gagnée est reprise en hauteur. */
  size: number
  /** Estompée par un mode : ni clic, ni glisser, ni menu. */
  frozen?: boolean
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: activity.id,
    disabled: frozen,
  })
  const clicOuCoche = useSelectOrToggle(
    onSelect,
    onToggleDone,
    panelOpen,
    onClosePanel,
    onShiftSelect,
  )
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...(frozen ? {} : listeners)}
      type="button"
      aria-pressed={activity.done}
      aria-label={activity.title}
      data-activity-block
      data-activity-id={activity.id}
      onClick={frozen ? undefined : clicOuCoche.onClick}
      onDoubleClick={frozen ? undefined : clicOuCoche.onDoubleClick}
      onContextMenu={frozen ? (e) => e.preventDefault() : onContextMenu}
      style={{ width: size, height: size }}
      className={cn(
        // Le côté vient de la rangée : 24px fixes, en pixels entiers (cf.
        // `dayLayout`). Carré — étirer la seule largeur couchait les emojis
        // dans des rectangles ; entier — à demi-pixel l'emoji croustille.
        'relative flex shrink-0 cursor-grab items-center justify-center rounded-md border text-[13px] active:cursor-grabbing',
        frozen && FROZEN_CLASS,
        'transition duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        color,
        // Ratée hors focus : grisée, bord pointillé.
        greyed && 'border-dashed opacity-50 grayscale',
        overdue && OVERDUE_RING,
        dragging && 'opacity-30',
        // Un anneau de 2px sur une pastille de 24px mange la couleur du domaine.
        selected && 'ring-1 ring-primary/50',
      )}
    >
      {emoji || '•'}
      {activity.done && (
        <DoneMark
          size="pill"
          className={cn('absolute -top-[3px] -right-[3px]', inkClassName)}
        />
      )}
      {missed && !activity.done && (
        <MissedMark size="pill" className="absolute -top-[3px] -right-[3px]" />
      )}
    </button>
  )
}

/**
 * Débord de la rangée « jour ». La rangée tient sur **une seule ligne** : au-delà
 * de ce qui rentre dans la colonne, le dernier carré devient un compteur qui
 * ouvre le reste.
 *
 * Empiler était la solution évidente et la mauvaise : la hauteur de la bande
 * suivait la journée la plus chargée, et repoussait la grille horaire d'autant
 * — trois occurrences un mardi et toute la semaine perdait de l'heure visible.
 * Une bande dont la hauteur ne dépend plus du contenu, c'est une grille qui ne
 * bouge plus.
 *
 * Le débord garde la même pastille, donc les mêmes gestes : clic pour ouvrir le
 * panneau, clic droit pour le menu. Le glisser-déposer, lui, reste à la rangée
 * — on ne traîne pas une activité hors d'un popover.
 */
export function DailyOverflow({
  count,
  size,
  children,
}: {
  count: number
  /** Même créneau que les pastilles : il en occupe un, il n'en ajoute pas. */
  size: number
  children: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Voir ${count} activité${count > 1 ? 's' : ''} de plus`}
          style={{ width: size, height: size }}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md',
            // Surface pleine, pas un pointillé : le compteur occupe un créneau
            // au même titre que les autres. En transparent il se lisait comme
            // un trou dans la rangée plutôt que comme un contenu replié.
            // Voisine de `domainColor(...).soft` : même bordure à 40 %, fond
            // un cran plus léger. Le compteur est de la même famille que les
            // pastilles qu'il replie, mais il ne porte pas de teinte — un gris
            // au même poids qu'une couleur tirerait l'œil pour rien.
            'border border-muted-foreground/40 bg-muted-foreground/8 text-[13px] font-medium text-foreground/80',
            'transition duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            'hover:bg-muted-foreground/20 hover:text-foreground',
          )}
        >
          +{count}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-52 p-2">
        <div className="flex flex-wrap items-center gap-1">{children}</div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Cellule droppable d'une rangée de la bande « jour » (surbrillance au survol).
 *
 * Une cellule **par rangée** et non une par journée : « quotidien » et
 * « aujourd'hui » sont deux lignes de lecture distinctes, et des cellules qui
 * traverseraient les deux les recolleraient en une seule bande — c'est
 * précisément ce qu'on défait. Elles vivent **dans** la grille du contenu, pas
 * sur un calque absolu au-dessous : un calque ne sait pas suivre des hauteurs
 * de rangée qu'il ne calcule pas.
 *
 * Les deux restent des cibles de dépôt, avec le même effet — on ne va pas
 * interdire de lâcher une occurrence quotidienne dans la rangée qui la montre.
 */
export function AllDayDrop({
  day,
  band,
  row,
}: {
  day: number
  /** Détermine l'identifiant de dépôt — cf. `allDayTargetIndex`. */
  band: 'daily' | 'today'
  /** Placement vertical, en syntaxe `grid-row`. */
  row: string
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${band === 'daily' ? 'allday-daily' : 'allday'}:${day}`,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: day + 2, gridRow: row }}
      className={cn(
        'border-r border-border',
        // Seule la rangée du haut ferme en bas : celle du dessous s'appuie sur
        // la bordure de la bande entière.
        band === 'daily' && 'border-b',
        isOver && 'bg-primary/10',
      )}
    />
  )
}

/** Pastille d'une activité all-day (draggable). */
export function AllDayPill({
  activity,
  color,
  colorSolid,
  inkClassName,
  emoji,
  dragging,
  missed = false,
  selected,
  onSelect,
  onToggleDone,
  onShiftSelect,
  onContextMenu,
  panelOpen,
  onClosePanel,
  stretch,
  style,
  frozen = false,
}: {
  activity: Activity
  color: string
  colorSolid: string
  /** Encre du domaine pour la coche (`domainColor(...).ink`). */
  inkClassName?: string
  emoji: string
  dragging: boolean
  /** Ratée (non faite, tout l'intervalle révolu) : la croix grise. */
  missed?: boolean
  selected: boolean
  onSelect: (rect: DOMRect) => void
  onToggleDone: () => void
  /** Maj + clic : ajouter ou retirer de la sélection (absent : pas de
   *  sélection, comme pendant une liaison). */
  onShiftSelect?: () => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Le panneau est ouvert **sur cette activité** — cf. `useSelectOrToggle`. */
  panelOpen?: boolean
  /** Referme le panneau — un double-clic lent ne doit rien laisser ouvert. */
  onClosePanel?: () => void
  /** Étalée sur plusieurs jours : occupe toute sa plage de colonnes. Sinon la
   *  pilule se dimensionne à son contenu et suit le flux de sa journée. */
  stretch?: boolean
  style?: React.CSSProperties
  /** Estompée par un mode : ni clic, ni glisser, ni menu. */
  frozen?: boolean
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: activity.id,
    disabled: frozen,
  })
  const clicOuCoche = useSelectOrToggle(
    onSelect,
    onToggleDone,
    panelOpen,
    onClosePanel,
    onShiftSelect,
  )
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(frozen ? {} : listeners)}
      data-activity-block
      data-activity-id={activity.id}
      onClick={frozen ? undefined : clicOuCoche.onClick}
      onDoubleClick={frozen ? undefined : clicOuCoche.onDoubleClick}
      onContextMenu={frozen ? (e) => e.preventDefault() : onContextMenu}
      style={style}
      className={cn(
        'flex h-7 cursor-grab items-center gap-1.5 overflow-hidden rounded-md border px-2 text-xs active:cursor-grabbing',
        frozen && FROZEN_CLASS,
        // `flex-auto` : la pilule part de sa largeur de contenu puis absorbe
        // l'espace libre de sa ligne — la cellule paraît pleine. On ne peut pas
        // viser « la dernière de chaque ligne » en CSS (les retours à la ligne
        // sont décidés par le navigateur), donc toutes celles d'une même ligne
        // se partagent la croissance.
        stretch ? 'mx-1' : 'max-w-full min-w-0 flex-auto',
        selected ? colorSolid : color,
        dragging && 'opacity-30',
        // Plus d'effacement du bloc entier : `TimedCardBody` efface
        // l'emoji et le titre à 70 %, la méta à 50 %. Cumulés, les deux
        // tombaient à 49 % et 35 %, et le bloc fait devenait illisible.
        selected && 'ring-2 ring-primary/40',
      )}
    >
      <AllDayBody
        done={activity.done}
        emoji={emoji}
        title={activity.title}
        check={
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleDone()
            }}
            className={CHECK_BUTTON}
            title={activity.done ? 'Marquer non fait' : 'Marquer fait'}
          >
            <CardCheck
              done={activity.done}
              missed={missed}
              inkClassName={inkClassName}
            />
          </button>
        }
      />
    </div>
  )
}
