import { cn } from '@/shared/lib/utils'
import { fmtHour } from '@/shared/lib/date'
import { DoneMark, MissedMark } from '@/shared/ui'

import type { LinkedItem } from '../model/decoration'

/**
 * Case à cocher visuelle partagée (card réelle + overlay de drag).
 *
 * Faite, c'est `DoneMark` — la coche unique du produit. Le `CheckCircle2`
 * filaire qu'elle rendait avant se confondait avec le cercle pointillé du
 * « à faire » : même diamètre, même trait, la seule différence était un ✓
 * ténu au centre.
 *
 * **Les deux états font exactement la même taille**, 14px : ils occupent la
 * même case sur la ligne du titre, et cocher ne doit rien déplacer. Le cercle
 * pointillé valait 16px — la taille du `CheckCircle2` qu'il accompagnait —, si
 * bien que depuis que la coche pleine fait 14, cocher faisait sauter le titre
 * de deux pixels vers la gauche.
 */
export function CardCheck({
  done,
  missed = false,
  inkClassName,
  className,
  thin = false,
}: {
  done: boolean
  /** La ligne fine d'un bloc d'un quart d'heure : 8 px au lieu de 14. */
  thin?: boolean
  /** Ratée (non faite, jour révolu) : la croix grise à la place du cercle. */
  missed?: boolean
  /** Encre du domaine pour la coche (`domainColor(...).ink`). */
  inkClassName?: string
  className?: string
}) {
  const size = thin ? 'thin' : 'block'
  if (!done && missed) return <MissedMark size={size} className={className} />
  return done ? (
    <DoneMark size={size} className={cn(inkClassName, className)} />
  ) : (
    <span
      className={cn(
        'block shrink-0 rounded-full border border-dashed border-current opacity-50',
        thin ? 'size-[8px]' : 'size-[14px]',
        className,
      )}
    />
  )
}

/**
 * Le bouton qui porte `CardCheck` sur un bloc ou une pilule. Au survol, la
 * coche grossit et le cercle pointillé perd sa transparence : c'est le seul
 * signe qu'elle se clique à part du bloc, qui ouvre le panneau.
 */
export const CHECK_BUTTON =
  'shrink-0 rounded-full transition-transform duration-100 hover:scale-125 hover:[&>span]:opacity-100'

/**
 * Contenu visuel d'un bloc horaire — source unique partagée par le bloc réel
 * (TimedBlock) et l'overlay de drag, pour qu'ils restent identiques. `check`
 * est injecté (bouton interactif côté bloc, span statique côté overlay).
 *
 * **Le titre prend les lignes que la durée lui laisse** (changelog #20). Il
 * était tronqué sur une ligne quelle que soit la hauteur : un bloc de deux
 * heures montrait « Atelier roadmap Q4 avec… » et soixante pixels de vide. Le
 * nombre de lignes est calculé par l'appelant, qui seul connaît la hauteur.
 *
 * La première ligne est **haute de 15px et alignée en haut** : la coche et
 * l'emoji se centrent dans cette hauteur, si bien qu'ils restent sur la ligne
 * de base du titre quand celui-ci déroule en dessous. Centrer la rangée
 * entière les aurait fait descendre au milieu d'un titre de quatre lignes.
 *
 * **Un bloc qui partage sa largeur (#55) s'allège** selon le nombre de
 * colonnes : à deux, coche et emoji sur une ligne, le titre dessous (césure
 * avec tiret si un mot ne tient pas), sans plage horaire ; à trois, l'emoji et le titre sur une ligne,
 * sans coche ; à quatre, l'emoji seul.
 *
 * Plus de marques en coin (🧠, 🌱, #85) depuis #108 : les actes se lisent
 * sous le titre, une ligne par savoir.
 */
/** Le corps d'un bloc : une colonne pleine hauteur, dont le pied (horaire,
 *  liens) se cale en bas. */
const BODY = 'flex h-full flex-col'

export function TimedCardBody({
  done,
  emoji,
  title,
  startH,
  endH,
  valueLabel,
  compact,
  thin = false,
  titleLines = 1,
  check,
  cols = 1,
  narrowMeta = false,
  marksOffset = 0,
  linked = [],
  linkedOpen = false,
  linkedRow = true,
}: {
  done: boolean
  emoji: string
  title: string
  startH: number
  endH: number
  valueLabel: string | null
  compact: boolean
  /** Un quart d'heure : la ligne fine (`isThinBlock`). */
  thin?: boolean
  /** Lignes que la hauteur du bloc laisse au titre — cf. `titleLinesFor`. */
  titleLines?: number
  check: React.ReactNode
  /** Colonnes que le bloc partage (1 à 4) — cf. `layoutDay`. */
  cols?: number
  /** À deux ou trois colonnes : la hauteur laisse aussi la plage horaire. */
  narrowMeta?: boolean
  /** La place prise en coin par des gestes (préparation) : la dernière ligne
   *  se décale d'autant. */
  marksOffset?: number
  /**
   * Ce qui est lié à la séance — ses actes, une ligne par savoir (#108) ; en
   * préparation, aussi réalisations et cibles (#92 point 7) : les emojis, ou
   * — `linkedOpen` — une ligne par lien, emoji et nom.
   */
  linked?: LinkedItem[]
  linkedOpen?: boolean
  /** Les emojis ont leur ligne sous le titre ; sinon ils suivent l'horaire. */
  linkedRow?: boolean
}) {
  // Fait : l'emoji et le titre s'effacent à 70 %, la méta à 50 %, et le titre
  // n'est plus BARRÉ. Le barré appartient aux lignes de liste, où il distingue
  // d'un coup d'œil ce qui reste à faire ; sur un bloc, la coche suffit et le
  // trait rendait le titre pénible à relire.
  const emojiEl = emoji ? (
    <span
      className={cn(
        'shrink-0 text-[13px] leading-[15px]',
        done && 'opacity-70',
      )}
    >
      {emoji}
    </span>
  ) : null
  // La coche se centre dans la hauteur de la première ligne plutôt que de s'y
  // caler par un décalage en dur : le navigateur place le disque de 14 dans les
  // 15, et nous n'écrivons pas de demi-pixel dans la feuille de style.
  const checkEl = (
    <span className="flex h-[15px] shrink-0 items-center">{check}</span>
  )
  const titleEl = (
    <span
      className={cn('min-w-0 flex-1 font-medium', done && 'opacity-70')}
      style={{
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: titleLines,
        overflow: 'hidden',
        lineHeight: '15px',
        // Un mot trop large pour la colonne se coupe avec un tiret (césure
        // française, comme la semaine de l'accueil) ; sans césure possible,
        // il se coupe quand même plutôt que de déborder.
        hyphens: 'auto',
        overflowWrap: 'anywhere',
      }}
    >
      {title}
    </span>
  )
  const oneLine = (
    <span
      className={cn(
        'min-w-0 flex-1 truncate leading-[15px] font-medium',
        done && 'opacity-70',
      )}
    >
      {title}
    </span>
  )
  // Les gestes en coin (préparation) : la dernière ligne leur laisse la place.
  const pad = { paddingRight: marksOffset }
  // La plage horaire d'un bloc étroit, quand la hauteur la laisse passer.
  const rangeEl = narrowMeta && (
    <div
      className={cn(
        'mt-auto truncate pt-[2px] text-[11px] leading-[14px] tabular-nums',
        done ? 'opacity-50' : 'opacity-70',
      )}
      style={pad}
    >
      {fmtHour(startH)}–{fmtHour(endH)}
    </div>
  )
  const linkedEmojis = linked.map((l) => l.emoji).join('')
  // Replié : les emojis seuls, serrés. Déplié : une ligne par lien.
  const linkedEl =
    linked.length === 0 ? null : linkedOpen ? (
      // Le bloc assez haut les nomme d'office, une ligne par lien.
      <div className="mt-1 flex flex-col gap-0.5 overflow-hidden text-[10px] leading-3">
        {linked.map((l) => (
          <div key={l.key} className="flex min-w-0 gap-[3px]">
            <span className="shrink-0">{l.emoji}</span>
            <span className="truncate">{l.label}</span>
          </div>
        ))}
      </div>
    ) : linkedRow ? (
      <div
        className="mt-0.5 truncate text-[10px] leading-3 tracking-[1px]"
        style={pad}
      >
        {linkedEmojis}
      </div>
    ) : null
  // Sans place pour une ligne à eux, les emojis suivent l'horaire.
  const linkedInline =
    linked.length > 0 && !linkedOpen && !linkedRow ? (
      <span className="shrink-0 tracking-[1px]">{linkedEmojis}</span>
    ) : null
  // La ligne fine d'un quart d'heure : 11 px
  // de haut, tout centré sur une ligne, en 7,5 px — coche de 8, emoji de 7, le
  // titre tronqué, l'heure de début tant que le bloc a sa largeur. (La
  // maquette dit 10 px : le texte, jambages compris, doit tenir dans les 9 px
  // du dedans, sinon le bas des g et des p se coupe.)
  if (thin) {
    const thinEmoji = emoji ? (
      <span
        className={cn('shrink-0 text-[7px] leading-none', done && 'opacity-70')}
      >
        {emoji}
      </span>
    ) : null
    if (cols >= 4)
      return (
        <div className="flex h-full items-center justify-center">
          {thinEmoji}
        </div>
      )
    return (
      <div className="flex h-full items-center gap-1" style={pad}>
        {check}
        {thinEmoji}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[7.5px] leading-[9px] font-medium',
            done && 'opacity-70',
          )}
        >
          {title}
        </span>
        {cols === 1 && (
          <span
            className={cn(
              'shrink-0 text-[7.5px] leading-[9px] tabular-nums',
              done ? 'opacity-50' : 'opacity-70',
            )}
          >
            {fmtHour(startH)}
          </span>
        )}
      </div>
    )
  }
  if (cols >= 4) return <div className="flex justify-center">{emojiEl}</div>
  if (cols === 3)
    return (
      <div className={BODY}>
        <div
          className="flex items-start gap-1.5"
          style={rangeEl ? undefined : pad}
        >
          {emojiEl}
          {oneLine}
        </div>
        {rangeEl}
      </div>
    )
  if (cols === 2)
    return compact ? (
      <>
        <div className="flex items-start gap-1.5" style={pad}>
          {checkEl}
          {emojiEl}
          {oneLine}
        </div>
      </>
    ) : (
      <div className={BODY}>
        <div
          className="flex flex-wrap items-start gap-x-1.5 gap-y-px"
          style={rangeEl ? undefined : pad}
        >
          {checkEl}
          {emojiEl}
          <span
            className={cn('basis-full font-medium', done && 'opacity-70')}
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: titleLines,
              overflow: 'hidden',
              lineHeight: '15px',
              hyphens: 'auto',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </span>
        </div>
        {rangeEl}
      </div>
    )
  if (compact)
    return (
      <>
        <div className="flex items-center gap-1.5 leading-none" style={pad}>
          {check}
          {emojiEl}
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-medium leading-tight',
              done && 'opacity-70',
            )}
          >
            {title}
          </span>
          {linked.length > 0 && !linkedOpen && (
            <span className="shrink-0 text-[10px] tracking-[1px]">
              {linkedEmojis}
            </span>
          )}
          <span className={cn('shrink-0', done ? 'opacity-50' : 'opacity-70')}>
            {fmtHour(startH)}
          </span>
        </div>
        {linkedOpen && linkedEl}
      </>
    )
  return (
    <div className={BODY}>
      <div className="flex items-start gap-1.5">
        {checkEl}
        {emojiEl}
        {titleEl}
      </div>
      {/* Ce qui est lié se lit sous le titre (#108) ; l'horaire se cale en bas
          de la carte : d'une carte à l'autre, il tombe à la même hauteur,
          quelle que soit la longueur du titre. */}
      {(linkedOpen || linkedRow) && linkedEl}
      <div className="mt-auto">
        <div
          className={cn(
            'mt-[2px] flex items-center gap-1 text-[11px] leading-[14px]',
            done ? 'opacity-50' : 'opacity-70',
          )}
          style={pad}
        >
          <span className="shrink-0">
            {fmtHour(startH)}–{fmtHour(endH)}
          </span>
          {valueLabel && <span className="truncate">· {valueLabel}</span>}
          {linkedInline}
        </div>
      </div>
    </div>
  )
}

/** Contenu visuel d'une pastille all-day — partagé bloc réel + overlay. */
export function AllDayBody({
  done,
  emoji,
  title,
  check,
}: {
  done: boolean
  emoji: string
  title: string
  check: React.ReactNode
}) {
  return (
    <>
      {check}
      {emoji && (
        <span className={cn('text-[13px] leading-none', done && 'opacity-70')}>
          {emoji}
        </span>
      )}
      <span className={cn('truncate font-medium', done && 'opacity-70')}>
        {title}
      </span>
    </>
  )
}
