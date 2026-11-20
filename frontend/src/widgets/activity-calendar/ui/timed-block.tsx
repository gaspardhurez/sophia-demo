import { useDraggable } from '@dnd-kit/core'

import {
  type Activity,
  isOverdueRecall,
  OVERDUE_RING,
} from '@/entities/activity'
import { useSelectOrToggle } from '@/features/activity/edit'
import { hourOf } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

import {
  blockHeight,
  blockTop,
  isCompactBlock,
  isThinBlock,
  titleLinesBesideLinked,
  titleLinesFor,
  wrappedTitleLinesFor,
} from '../model/constants'
import {
  ALERT_BORDER,
  ALERT_SHADOW,
  type BlockDecoration,
  type LinkedItem,
  pickedTint,
  RAISED_HOVER_STYLE,
  RAISED_STYLE,
  raisedRing,
  FROZEN_CLASS,
  isQuiet,
} from '../model/decoration'
import { recallTip } from '../model/marks'
import {
  EXPANDED_SHADOW,
  isAlone,
  type Lane,
  laneStyle,
  laneDensity,
  REVEAL_TRANSITION,
} from '../model/overlap'
import { CardCheck, CHECK_BUTTON, TimedCardBody } from './card-body'

/** La teinte d'un bloc raté grisé, comme une pastille ratée. */
const GREYED_OPACITY = 0.5

/**
 * Bloc d'une activité datée, posé sur la grille horaire.
 *
 * Il se déplace au glisser et se redimensionne par ses **deux** bords. Seul
 * celui du bas porte une barre : en haut, la poignée reste invisible. Un bloc
 * n'a qu'un sens de lecture — son titre est en haut —, et deux barres
 * l'encadreraient comme une poignée de fenêtre. Le curseur suffit à dire que
 * le bord se prend.
 *
 * Quand des activités se chevauchent, il prend sa colonne (`lane`, #55) et
 * s'allège ; survolé, il repasse en pleine largeur par-dessus (`expanded`).
 * S'il en porte d'autres posés dessus, ce sont eux qui s'effacent en fondu
 * (`behind`) pour le dévoiler. Seul sur son créneau, rien ne bouge au survol.
 *
 * La séance qui porte une interro n'est jamais ratée : passé son
 * jour sans être cochée, un liseré rouge et « · en retard » en infobulle,
 * comme la tuile de l'interro (#84).
 */
export function TimedBlock({
  activity,
  dragging,
  selected,
  color,
  colorSolid,
  inkClassName,
  panelOpen,
  onClosePanel,
  emoji,
  valueLabel,
  resizeDur,
  resizeStartH,
  onSelect,
  onToggleDone,
  onShiftSelect,
  missed = false,
  greyed = false,
  onContextMenu,
  onResizeStart,
  narrow = false,
  lane,
  expanded = false,
  behind = false,
  onHoverEnter,
  onHoverLeave,
  decoration,
  linked = [],
}: {
  activity: Activity
  dragging: boolean
  selected: boolean
  color: string
  colorSolid: string
  /** Encre du domaine pour la coche (`domainColor(...).ink`). */
  inkClassName?: string
  /** Le panneau est ouvert **sur cette activité** — cf. `useSelectOrToggle`. */
  panelOpen?: boolean
  /** Referme le panneau — un double-clic lent ne doit rien laisser ouvert. */
  onClosePanel?: () => void
  emoji: string
  valueLabel: string | null
  resizeDur?: number
  /** Aperçu du début pendant un resize par le haut. */
  resizeStartH?: number
  onSelect: (rect: DOMRect) => void
  onToggleDone: () => void
  /** Maj + clic : ajouter ou retirer de la sélection (absent : pas de
   *  sélection, comme pendant une liaison). */
  onShiftSelect?: () => void
  /** Ratée (non faite, jour révolu) : la croix grise (24/10/2026). */
  missed?: boolean
  /** Ratée hors focus : grisée et estompée, bord pointillé, comme une
   *  pastille ratée. */
  greyed?: boolean
  onContextMenu: (e: React.MouseEvent) => void
  onResizeStart: (edge: 'top' | 'bottom', e: React.PointerEvent) => void
  /** Vue 3 jours : bloc serré, 3 px du bord et 7 px dedans (prod/Projet). */
  narrow?: boolean
  /** Sa colonne quand il chevauche d'autres activités. */
  lane?: Lane
  expanded?: boolean
  /** Celui qui le porte est survolé : il s'efface pour le dévoiler. */
  behind?: boolean
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  /** Habillage d'un mode piloté (préparation, liaison) — cf. `Decorate`. */
  decoration?: BlockDecoration
  /** Ce qui est lié à la séance : emojis, puis noms au survol (#92, 7). */
  linked?: LinkedItem[]
}) {
  // Estompée par un mode (autre projet, hors d'une liaison) : figée.
  const frozen = isQuiet(decoration)
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: activity.id,
    disabled: frozen,
  })
  const start = new Date(activity.start_at!)
  const end = activity.end_at ? new Date(activity.end_at) : null
  const startH = resizeStartH ?? hourOf(start)
  const baseDur = end ? (end.getTime() - start.getTime()) / 3_600_000 : 1
  const dur = resizeDur ?? baseDur
  const endH = startH + dur
  const compact = isCompactBlock(dur)
  // Un quart d'heure : sa vraie hauteur (11 px), une ligne fine.
  const thin = isThinBlock(dur)
  const overdue = isOverdueRecall(activity)
  // Soulevé (mode liaison), le survol le monte d'un cran au lieu de le
  // déplier : il garde sa place, la chip flottante s'y pose.
  const raised = Boolean(decoration?.raised)
  // Assez haut (et seul dans sa colonne), le bloc nomme ce qui y est lié, un
  // lien par ligne, sans survol.
  const besideLinked =
    laneDensity(lane) === 1 ? titleLinesBesideLinked(dur, linked.length) : null
  const linkedFull = besideLinked !== null
  // Sinon, le survol ne les déplie plus (24/10 : c'était lourd, et ce qu'on
  // y fera n'est pas encore sûr) — un clic ouvre le panneau.
  // Survolé, il se déplie par-dessus ses voisins ; seul sur son créneau, rien
  // ne bouge. Mis en avant
  // depuis l'extérieur, il se montre comme survolé.
  const shown =
    (expanded && !raised && !isAlone(lane)) || Boolean(decoration?.highlighted)
  const actions = decoration?.actions ?? []
  const shadows = [
    decoration?.alert && ALERT_SHADOW,
    overdue && !decoration?.alert && '0 0 0 1.5px #ef4444',
    shown && EXPANDED_SHADOW,
    raised &&
      (expanded ? RAISED_HOVER_STYLE.boxShadow : RAISED_STYLE.boxShadow),
    raised &&
      decoration &&
      raisedRing(decoration, expanded || Boolean(decoration.picked)),
  ].filter(Boolean)
  const tip =
    [
      recallTip(activity),
      decoration?.note && `${activity.title} · ${decoration.note}`,
    ]
      .filter(Boolean)
      .join('\n') || undefined
  const cols = shown ? 1 : laneDensity(lane)
  // À deux colonnes, le titre passe sous la coche ; la plage horaire suit
  // quand il reste au moins deux lignes de titre (à trois colonnes, dès que le
  // bloc n'est pas compact).
  const wrapped = wrappedTitleLinesFor(dur)
  const narrowMeta =
    (cols === 2 && !compact && wrapped >= 3) || (cols === 3 && !compact)
  // Les emojis liés prennent une ligne sous le titre quand la hauteur laisse
  // au titre deux lignes ou plus — il en cède une ; sinon ils suivent
  // l'horaire.
  const linkedRow = linked.length > 0 && titleLinesFor(dur) >= 2
  const titleLines =
    cols === 2
      ? wrapped - (narrowMeta ? 1 : 0)
      : linkedFull
        ? besideLinked
        : titleLinesFor(dur) - (linkedRow ? 1 : 0)

  // Un clic ouvre le panneau, deux cochent — cf. `useSelectOrToggle`.
  const clicOuCoche = useSelectOrToggle(
    onSelect,
    onToggleDone,
    panelOpen,
    onClosePanel,
    onShiftSelect,
  )

  const check = (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggleDone()
      }}
      // Sur la ligne fine, la coche de 8 px se prend sur 16 : une zone
      // invisible la déborde de 4 px de chaque côté.
      className={cn(
        CHECK_BUTTON,
        thin && "relative before:absolute before:-inset-1 before:content-['']",
      )}
      title={activity.done ? 'Marquer non fait' : 'Marquer fait'}
    >
      <CardCheck
        done={activity.done}
        missed={missed}
        inkClassName={inkClassName}
        thin={thin}
      />
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(frozen ? {} : listeners)}
      data-activity-block
      data-activity-id={activity.id}
      data-pick={decoration?.onPick ? '' : undefined}
      title={frozen ? undefined : tip}
      onClick={decoration?.onPick || frozen ? undefined : clicOuCoche.onClick}
      onDoubleClick={
        decoration?.onPick || frozen ? undefined : clicOuCoche.onDoubleClick
      }
      // Un mode qui choisit une séance (liaison) prend le clic avant tout le
      // reste : ni panneau, ni coche.
      onClickCapture={
        decoration?.onPick
          ? (e) => {
              e.stopPropagation()
              decoration.onPick?.(e)
            }
          : undefined
      }
      // Des gestes posés sur le bloc remplacent son menu contextuel.
      onContextMenu={
        actions.length > 0 || frozen ? (e) => e.preventDefault() : onContextMenu
      }
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        top: blockTop(startH, dur),
        height: blockHeight(dur),
        ...laneStyle(lane, narrow ? 3 : 4, shown),
        // Estompé (focus, liaison), il passe sous tout le reste — fantômes
        // compris : il n'a plus sa colonne, il ne doit rien cacher.
        // Celui qui en porte d'autres ne passe pas devant d'un coup : ce sont
        // eux qui s'effacent (`behind`).
        zIndex:
          shown && !lane?.host
            ? 30
            : frozen
              ? 5
              : lane?.nested
                ? 15
                : 10 + (lane?.col ?? 0),
        ...(raised && {
          ...(expanded ? RAISED_HOVER_STYLE : RAISED_STYLE),
          zIndex: expanded ? 31 : 12,
          cursor: 'pointer',
        }),
        // Un bloc posé sur un autre s'en détache par sa bordure : pas de
        // liseré en plus (#62). Le liseré de l'interro en retard, lui, reste,
        // comme le halo d'une séance non faite et l'anneau d'une liaison.
        ...(shadows.length > 0 && { boxShadow: shadows.join(', ') }),
        ...(behind && { opacity: 0, pointerEvents: 'none' }),
      }}
      // Deux couches : un fond OPAQUE, puis la teinte du domaine par-dessus.
      // Les teintes `soft` sont à 15 % d'opacité — posées seules sur la grille
      // horaire, ses traits traversaient les blocs. Elles ne posaient pas de
      // problème sur la rangée « jour », qui n'a rien derrière.
      className={cn(
        'group absolute cursor-grab select-none bg-card shadow-xs active:cursor-grabbing',
        thin ? 'rounded-[4px]' : 'rounded-md',
        REVEAL_TRANSITION,
        // Le drag garde son atténuation SUR le conteneur : un bloc qu'on
        // déplace est un fantôme, laisser voir la grille dessous aide à viser.
        dragging && 'opacity-30',
        overdue && !shadows.length && OVERDUE_RING,
        frozen && FROZEN_CLASS,
        selected && 'ring-2 ring-primary/40',
      )}
    >
      <div
        className={cn(
          'size-full overflow-hidden border text-xs',
          thin ? 'rounded-[4px]' : 'rounded-md',
          cols >= 4 ? 'px-0' : thin ? 'px-[6px]' : narrow ? 'px-[7px]' : 'px-2',
          thin ? 'py-0' : compact || cols >= 4 ? 'py-0.5' : 'py-1',
          selected ? colorSolid : color,
          greyed && !selected && 'border-dashed grayscale',
          // « Fait » atténue la TEINTE, pas le bloc : sur le conteneur,
          // l'opacité rendait translucide le fond opaque lui-même et la grille
          // repassait au travers dès qu'on cochait.
          // Plus d'effacement du bloc entier : `TimedCardBody` efface
          // l'emoji et le titre à 70 %, la méta à 50 %. Cumulés, les deux
          // tombaient à 49 % et 35 %, et le bloc fait devenait illisible.
        )}
        // Allongé, le bloc n'a plus de hauteur fixe : le cadre suit le contenu
        // sans descendre sous sa hauteur de repos.
        //
        // Estompé, c'est la teinte qui s'efface, pas le bloc : le fond opaque
        // reste, et un bloc posé sur un autre ne laisse pas voir celui du
        // dessous à travers lui.
        style={{
          ...((decoration?.opacity != null || greyed) && {
            opacity: Math.min(
              decoration?.opacity ?? 1,
              greyed ? GREYED_OPACITY : 1,
            ),
          }),
          ...(decoration?.alert && { borderColor: ALERT_BORDER }),
          ...(decoration && pickedTint(decoration)
            ? { backgroundImage: pickedTint(decoration) }
            : {}),
        }}
      >
        <TimedCardBody
          done={activity.done}
          emoji={emoji}
          title={activity.title}
          startH={startH}
          endH={endH}
          valueLabel={valueLabel}
          compact={compact}
          thin={thin}
          titleLines={titleLines}
          check={check}
          cols={cols}
          narrowMeta={narrowMeta}
          marksOffset={actions.length > 0 ? actions.length * 20 + 2 : 0}
          linked={linked}
          linkedOpen={linkedFull}
          linkedRow={linkedRow}
        />
      </div>
      {actions.length > 0 && (
        <div className="absolute right-[4px] bottom-[4px] z-[2] flex gap-0.5">
          {actions.map((x) => (
            <button
              key={x.key}
              type="button"
              title={x.label}
              aria-label={x.label}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                x.onClick()
              }}
              className="grid size-[18px] place-items-center rounded-[4px] border border-border bg-background text-foreground hover:bg-muted [&_svg]:size-3"
            >
              {x.icon}
            </button>
          ))}
        </div>
      )}
      {/* Figée, la carte n'a pas de poignées (ni curseur, ni barre au
          survol). Le bord haut se prend sans rien montrer. */}
      {!frozen && (
        <>
          <div
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart('top', e)
            }}
            // Le clic d'un bord immobile remonte au bloc : il ouvre le
            // panneau, comme partout ailleurs sur le bloc.
            aria-hidden
            // Sur la ligne fine (11 px), deux bords de 8 px couvriraient le
            // bloc entier : 3 px chacun, le milieu reste au glisser et au clic.
            className={cn(
              'absolute inset-x-0 top-0 cursor-ns-resize',
              thin ? 'h-[3px]' : 'h-2',
            )}
          />
          <div
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart('bottom', e)
            }}
            className={cn(
              'absolute inset-x-0 bottom-0 cursor-ns-resize opacity-0 group-hover:opacity-100',
              thin ? 'h-[3px]' : 'h-2',
            )}
          >
            {/* La barre de la poignée n'a pas sa place sur 11 px : le curseur
                suffit. */}
            {!thin && (
              <div className="mx-auto h-0.5 w-6 translate-y-0.5 rounded-full bg-current opacity-40" />
            )}
          </div>
        </>
      )}
    </div>
  )
}
