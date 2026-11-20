import type { CSSProperties, ReactNode } from 'react'

import type { Activity, DraftSeed } from '@/entities/activity'
import type { Ghost } from '@/entities/activity-type'

/**
 * Ce que le calendrier pose sur sa grille : une activité, ou un fantôme (ce
 * que la planification poserait, sans rien en base).
 */
export type CalendarItem =
  { kind: 'activity'; activity: Activity } | { kind: 'ghost'; ghost: Ghost }

/**
 * Comment un mode qui **pilote** le calendrier de l'extérieur habille une
 * séance — la préparation de la semaine (#92), et demain la liaison.
 *
 * Le calendrier ne sait rien du mode : il applique. L'appelant décide, séance
 * par séance (`Decorate`).
 *
 * - **Préparation, focus sur un projet** : ce qui ne le concerne pas passe à
 *   `opacity: 0.3` ; le survol d'une ligne du panneau met sa séance en avant
 *   (`highlighted`).
 * - **Préparation, semaine écoulée** : une séance non faite prend un halo
 *   rouge (`alert`) et ses gestes en icônes (`actions`).
 * - **Liaison (« Aimant »)** : les séances compatibles se soulèvent
 *   (`raised`) et un clic les choisit (`onPick`, qui remplace l'ouverture du
 *   panneau) ; celles déjà liées sont teintées (`picked`) ; les autres passent
 *   à `opacity: 0.25`.
 */
export interface BlockDecoration {
  /** Absente : le calendrier ne la montre pas (un fantôme qu'un mode écarte). */
  hidden?: boolean
  /** Estompée : l'opacité de la séance entière (le fantôme la multiplie). */
  opacity?: number
  /** Mise en avant depuis l'extérieur : comme survolée (pleine largeur,
   *  ombre de survol). */
  highlighted?: boolean
  /** Soulevée : elle se détache de la grille (translation et ombre). */
  raised?: boolean
  /** Un clic choisit la séance au lieu d'ouvrir son panneau. Le bloc porte
   *  alors `data-pick` : la chip qui suit le curseur s'y pose (`Picking`).
   *  `shiftKey` : Maj enfoncée, pour lier plusieurs séances d'un passage. */
  onPick?: (e: { shiftKey: boolean }) => void
  /** Déjà liée à ce qu'on lie (mode liaison) : teintée, et un clic la délie. */
  picked?: boolean
  /** La couleur (CSS) de l'anneau d'une séance soulevée — celle du domaine. */
  accent?: string
  /** Halo rouge : une séance non faite à traiter (préparation, #92). */
  alert?: boolean
  /** Des gestes en icônes bordées, en coin bas droit du bloc — à la place du
   *  menu contextuel, qui se tait. */
  actions?: BlockAction[]
  /** Un complément d'infobulle (« reportée »). */
  note?: string
}

/** Un geste posé sur un bloc (✓ Faite, ↻ Reporter). */
export interface BlockAction {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
}

/**
 * Le **mode liaison** (« Aimant », #92) vu du calendrier : une chip
 * « flottante » suit le curseur sur tout le calendrier (bande journée
 * comprise) et se pose dans le coin de la séance choisissable survolée. Un
 * clic ailleurs dans le calendrier annule — c'est le choix des séances
 * (`BlockDecoration.onPick`) qui lie.
 */
export interface Picking {
  /** Le contenu de la chip : emoji et nom de ce qu'on lie. */
  label: ReactNode
  onCancel: () => void
  /**
   * Lier à une séance **qu'on crée** : un double-clic ou un cliquer-glisser
   * sur un créneau vide ouvre le brouillon, comme hors liaison ; l'activité
   * créée est rendue ici, pour y faire le lien. Sans lui, tout clic hors
   * d'une séance choisissable annule.
   */
  onCreated?: (activity: Activity) => void
  /** Ce que le brouillon porte d'emblée (l'acte, la réalisation, la cible
   *  qu'on lie) : on le voit dans le panneau, il part à la création. */
  draftSeed?: DraftSeed
}

export type Decorate = (item: CalendarItem) => BlockDecoration | undefined

/**
 * Ce qui est lié à une séance et que le calendrier montre dessus (#92, point
 * 7) : par défaut les emojis, au survol la carte s'allonge et liste les noms.
 * Les actes d'apprentissage, les réalisations préparées et les cibles de
 * résultat.
 */
export interface LinkedItem {
  key: string
  emoji: string
  label: string
}

/**
 * Une vue **pilotée** : la semaine affichée appartient à l'appelant, et la
 * navigation est bornée (la préparation n'a que deux semaines). L'en-tête perd
 * « Aujourd'hui » et « Préparer », et prend la légende et les actions fournies.
 */
export interface CalendarView {
  weekStart: Date
  onWeekStartChange: (weekStart: Date) => void
  /** Premier et dernier début de semaine atteignables. */
  min: Date
  max: Date
  /** Après les flèches : « Semaine écoulée 28 sept. → 4 oct. ». */
  caption?: ReactNode
  /** À droite de l'en-tête (sortir du mode). */
  actions?: ReactNode
}

/** Le gabarit d'un bloc soulevé (mode liaison). */
export const RAISED_STYLE: CSSProperties = {
  transform: 'translateY(-2px)',
  boxShadow: '0 6px 14px -6px rgba(0,0,0,.28)',
  transition: 'transform .18s, box-shadow .18s',
}

/** Une pastille mise en avant : un cran plus grande, avec l'ombre de survol. */
export const HIGHLIGHTED_PILL_STYLE: CSSProperties = {
  transform: 'scale(1.12)',
  boxShadow: '0 4px 12px -2px oklch(0.21 0.008 285 / 0.28)',
  borderRadius: 6,
}

/** Le gabarit d'un bloc soulevé **survolé** : il monte d'un cran de plus. */
export const RAISED_HOVER_STYLE: CSSProperties = {
  transform: 'translateY(-4px)',
  boxShadow: '0 10px 20px -6px rgba(0,0,0,.38)',
  transition: 'transform .18s, box-shadow .18s',
}

/** Le halo d'une séance non faite à traiter. */
export const ALERT_SHADOW = '0 0 0 3px #ef444433'
/** Le « halo rouge » d'une non faite (prod/Preparation de la semaine) : c'est
 *  la **bordure** de la carte qui passe au rouge, plus une lueur légère —
 *  pas un anneau posé autour. */
export const ALERT_BORDER = '#ef4444'
/** Sur l'enveloppe d'une pastille : la bordure est celle de la pastille. */
export const ALERT_PILL_CLASS = '[&>*]:border-[#ef4444]!'

/** L'anneau d'une séance soulevée : plus marqué survolée ou déjà liée. */
export function raisedRing(d: BlockDecoration, strong: boolean): string {
  const c = d.accent ?? 'var(--color-ring)'
  return `0 0 0 ${strong ? 2 : 1.5}px ${c}`
}

/** La teinte d'une séance déjà liée à ce qu'on lie. */
export function pickedTint(d: BlockDecoration): string | undefined {
  if (!d.picked) return undefined
  const c = d.accent ?? 'var(--color-ring)'
  return `linear-gradient(color-mix(in oklab, ${c} 20%, transparent), color-mix(in oklab, ${c} 20%, transparent))`
}

/** Le style d'enveloppe d'une pastille décorée (opacité, mise en avant). */
export function pillStyle(d: BlockDecoration | undefined): CSSProperties {
  if (!d) return {}
  const shadows = [
    d.alert && ALERT_SHADOW,
    d.raised && RAISED_STYLE.boxShadow,
    d.raised && raisedRing(d, Boolean(d.picked)),
  ].filter(Boolean)
  return {
    ...(d.opacity != null && { opacity: d.opacity }),
    ...(d.highlighted && HIGHLIGHTED_PILL_STYLE),
    ...(d.raised && RAISED_STYLE),
    ...(shadows.length > 0 && { boxShadow: shadows.join(', ') }),
    ...(d.alert && { borderColor: ALERT_BORDER }),
    ...(d.raised && { borderRadius: 6, cursor: 'pointer' }),
    ...(pickedTint(d) && { backgroundImage: pickedTint(d) }),
    transition: 'opacity .15s, transform .15s, box-shadow .15s',
  }
}

/** Estompée par un mode (autre projet que celui ouvert, séance hors d'une
 *  liaison) : elle reste visible mais ne réagit pas au survol. */
export function isQuiet(d: BlockDecoration | undefined): boolean {
  return (d?.opacity ?? 1) < 1
}

/** Une carte figée (estompée par un mode) : ni clic, ni glisser, ni menu — ses
 *  contrôles internes (coche, poignées) ne prennent plus le pointeur. Elle
 *  garde `data-activity-block` : la grille ne crée rien sous elle. */
export const FROZEN_CLASS =
  'cursor-default! active:cursor-default! [&_*]:pointer-events-none'

/** L'opacité de ce qui ne compte pas pour le projet en focus — partout où
 *  le calendrier est focus sur un projet (page projet, calendrier,
 *  préparation). */
export const FOCUS_DIMMED = 0.3
