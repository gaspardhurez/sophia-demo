import type { CSSProperties, ReactNode } from 'react'

import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { ProgressMeter, RotationDots, useRotation } from '@/shared/ui'

import type { ProgressLine } from '../model/progress'
import type { WeekAhead } from '../model/week'
import { UnitMarkGlyph } from './unit-mark'

/** Une valeur lue au calendrier tombe vite en 18,060000000000002. */
const round = (n: number) => Math.round(n * 100) / 100

/**
 * La carte d'un projet sur une semaine — celle de la colonne « Projets de
 * la semaine » du calendrier, et celle de la liste de la préparation de la
 * semaine (#92, « identique à celle du calendrier »).
 *
 * Projet · étape sur une ligne, puis la barre d'un Total avec son ratio.
 * Plusieurs Totaux : **une barre à la fois**, des points après la valeur et un
 * défilement automatique ; un clic sur un point affiche sa barre et fige le
 * défilement — le mécanisme du panneau d'activité (#44, `useRotation`).
 *
 * Inerte : ce qui y mène (lien, clic) et ce qui la complète (« +n cette
 * semaine », les chips de la préparation) arrive de l'appelant.
 */
export function WeekProjectCard({
  title,
  stepTitle,
  trailing,
  lines,
  planned,
  showPlanned = true,
  barClassName,
  color,
  footer,
  onClick,
  className,
  style,
  stepBelow = false,
  titleClassName,
  afterTitle,
}: {
  /** Le projet, emoji compris — texte, ou lien vers sa page. */
  title: ReactNode
  stepTitle: string | null
  /** En bout de la ligne de titre : ↗ au survol, la coche « revu »… */
  trailing?: ReactNode
  lines: ProgressLine[]
  /** Le prévisionnel par barre (`weekAhead`) : il ordonne les barres. */
  planned?: Map<string, WeekAhead>
  /** Le cumul prévu se peint en plein pâle après le réalisé. */
  showPlanned?: boolean
  barClassName: string
  /** La couleur du domaine en valeur CSS : le point courant du défilement. */
  color: string
  /** Sous la barre, selon la barre affichée. */
  footer?: (
    line: ProgressLine | undefined,
    planned: WeekAhead | undefined,
  ) => ReactNode
  onClick?: () => void
  className?: string
  style?: CSSProperties
  /** L'étape sur sa propre ligne, sous le titre — quand la carte a la place
   *  (accueil, page domaine) ; sinon à la suite du titre (calendrier). */
  stepBelow?: boolean
  /** La taille de la ligne de titre (12 px par défaut, la colonne du
   *  calendrier est étroite). */
  titleClassName?: string
  /** Juste après le titre, dans sa ligne : la pastille de rythme des cartes
   *  en grille. */
  afterTitle?: ReactNode
}) {
  // D'abord les barres qui bougent cette semaine : c'est leur prévu qui fait
  // apparaître la carte, la première vue doit le montrer.
  const ordered = [...lines].sort(
    (a, b) =>
      Number((planned?.get(b.key)?.week ?? 0) > 0) -
      Number((planned?.get(a.key)?.week ?? 0) > 0),
  )
  const { current, choose } = useRotation(ordered.length)
  const line = ordered[current]
  const p = line ? planned?.get(line.key) : undefined
  return (
    <div
      className={cn(
        'group/card rounded-lg border border-border p-3',
        onClick && 'cursor-pointer hover:border-foreground/20',
        className,
      )}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' && e.target === e.currentTarget) onClick()
            }
          : undefined
      }
    >
      {/* Projet et étape sur UNE ligne, tronquée : ces cartes s'empilent,
          et deux lignes de titre par carte coûtaient plus de hauteur que la
          barre qu'elles annoncent. Le projet porte le poids, l'étape le
          précise — même taille pour les deux, la couleur suffit. */}
      <div
        className={cn(
          'flex min-w-0 items-baseline gap-1',
          titleClassName ?? 'text-xs',
          stepBelow && stepTitle ? 'mb-0.5' : line && 'mb-1.5',
        )}
      >
        <span
          className={cn(
            'min-w-0 truncate font-medium',
            // Une pastille juste après le titre : le titre cède sa place
            // (tronqué) plutôt que de la pousser hors de la carte.
            !afterTitle && 'shrink-0',
          )}
        >
          {title}
        </span>
        {afterTitle && (
          <span className="ml-1 flex shrink-0 self-center">{afterTitle}</span>
        )}
        {stepTitle && !stepBelow && (
          <>
            <span className="shrink-0 text-muted-foreground">·</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {stepTitle}
            </span>
          </>
        )}
        {trailing && (
          <span className="ml-auto flex shrink-0 self-center">{trailing}</span>
        )}
      </div>
      {stepTitle && stepBelow && (
        <p
          className={cn(
            'truncate text-xs text-muted-foreground',
            line && 'mb-1.5',
          )}
        >
          {stepTitle}
        </p>
      )}
      {/* La barre avec son ratio. Le plein pâle porte le cumul prévu ; ce qui
          suit (le prévu de la semaine seule, les chips) vient de l'appelant. */}
      {line && (
        <ProgressMeter
          // Étape sous le titre (cartes en grille) : la barre se colle en
          // bas, alignée d'une carte à l'autre.
          className={cn(stepBelow && 'mt-auto pt-3')}
          value={line.value}
          max={line.max}
          planned={showPlanned ? (p?.cumul ?? 0) : 0}
          barClassName={barClassName}
          label={null}
          trailing={
            <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
              {round(line.value)}/{round(line.max)}{' '}
              {unitLabel(line.unit, line.max)}
              {/* Après l'unité : l'emoji dit DE QUOI parle la barre, il se lit
                  une fois le chiffre lu. */}
              <UnitMarkGlyph mark={line.mark} className="text-[10px]" />
              {/* Choisir une barre n'est pas ouvrir la carte — ni suivre le
                  lien qui l'enveloppe (accueil, page domaine). */}
              <span
                className="flex"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <RotationDots
                  labels={ordered.map(
                    (l) =>
                      `${round(l.value)}/${round(l.max)} ${unitLabel(l.unit, l.max)}`,
                  )}
                  current={current}
                  color={color}
                  onChoose={choose}
                />
              </span>
            </span>
          }
        />
      )}
      {footer?.(line, p)}
    </div>
  )
}
