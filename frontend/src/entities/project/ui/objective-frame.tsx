import { Check, X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'
import { DoneMark } from '@/shared/ui'

/**
 * Le cadre commun des cartes d'objectif (design #27) : bordure, rayon 10,
 * contenu en colonne, et une zone basse de 34px calée par `mt-auto` — jauge,
 * fil ou mosaïque — pour que des cartes de même hauteur s'alignent.
 */
export function ObjectiveFrame({
  warn,
  className,
  style,
  children,
}: {
  /** Bordure ambre : doublon, cible sous le record. */
  warn?: boolean
  className?: string
  /** Une bordure à l'encre du domaine (carte dont le panneau est ouvert). */
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      style={style}
      className={cn(
        'group/card flex min-w-0 flex-col gap-[9px] rounded-[10px] border bg-card px-3.5 py-3',
        warn ? 'border-amber-300' : 'border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * La coche ronde de 15px. Pleine à l'encre du domaine quand l'objectif est
 * rempli. Cliquable pour une réalisation : au survol, la coche se montre à
 * l'encre du domaine sur son fond doux (`softHover`).
 *
 * `failed` : le projet est clos et l'objectif n'est pas tenu — anneau rouge à
 * croix (design #32). Les trois sorties le lisent de même.
 */
export function ObjectiveCheck({
  done,
  failed = false,
  inkClassName,
  hoverClassName,
  onToggle,
  label,
}: {
  done: boolean
  /** Projet clos, objectif non tenu : anneau rouge à croix. */
  failed?: boolean
  inkClassName: string
  /** `domainColor(...).softHover` — requis dès que la coche est cliquable. */
  hoverClassName?: string
  onToggle?: () => void
  /** Nom accessible quand la coche est un bouton. */
  label?: string
}) {
  const missed = failed && !done
  if (!onToggle) {
    return done ? (
      <DoneMark size="row" className={inkClassName} />
    ) : missed ? (
      <MissedMark />
    ) : (
      <span className="size-[15px] shrink-0 rounded-full border-[1.5px] border-border bg-card" />
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={done}
      className={cn(
        'group/check grid size-[15px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
        done
          ? cn('border-transparent text-white', inkClassName)
          : missed
            ? 'border-rose-600 bg-card text-rose-600'
            : cn('border-border bg-card', hoverClassName),
      )}
    >
      {missed ? (
        <X className="size-[9px]" strokeWidth={3.5} />
      ) : (
        <Check
          className={cn(
            'size-[11px]',
            !done && 'opacity-0 group-hover/check:opacity-100',
          )}
          strokeWidth={3}
        />
      )}
    </button>
  )
}

/** L'anneau rouge à croix d'un objectif non tenu, projet clos. */
function MissedMark() {
  return (
    <span className="grid size-[15px] shrink-0 place-items-center rounded-full border-[1.5px] border-rose-600 bg-card text-rose-600">
      <X className="size-[9px]" strokeWidth={3.5} />
    </span>
  )
}

/** « TOTAL », « RÉSULTAT »… — le type de l'objectif, en tête de carte. */
export function ObjectiveLabel({
  children,
  editing,
}: {
  children: ReactNode
  editing?: boolean
}) {
  return (
    <span
      className={cn(
        'font-semibold uppercase text-muted-foreground',
        editing
          ? 'text-[11px] tracking-[.06em]'
          : 'text-[10px] tracking-[.05em]',
      )}
    >
      {children}
    </span>
  )
}
