import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

interface ProgressMeterProps {
  value: number
  max: number
  /**
   * Ce qui est **planifié et pas encore fait**, posé en hachures à la suite du
   * plein. Dit « il en reste tant de prévu », là où la barre seule ne dit que
   * ce qui est acquis — deux étapes au même remplissage n'ont pas le même
   * avenir selon ce qui est déjà au calendrier.
   */
  planned?: number
  /** Infobulle du segment prévisionnel (le chiffre n'a pas toujours sa place). */
  plannedTitle?: string
  /** Libellé à gauche (ex. « 12/50 recettes »). */
  label?: ReactNode
  /** Classe de remplissage de la barre (ex. couleur de domaine). */
  barClassName?: string
  /** Contenu à droite ; remplace le % quand fourni (ex. chip de rythme). */
  trailing?: ReactNode
  className?: string
}

/** Barre de progression : libellé à gauche, barre au centre, % (ou `trailing`) à droite. */
export function ProgressMeter({
  value,
  max,
  planned = 0,
  plannedTitle,
  label,
  barClassName,
  trailing,
  className,
}: ProgressMeterProps) {
  // Le pourcentage AFFICHÉ n'est pas plafonné : dépasser sa cible est une
  // information — « 118 % » dit qu'on a fait plus que prévu, là où « 100 % »
  // le cachait. Seule la LARGEUR de la barre est bornée, faute de place.
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const filled = Math.min(100, pct)
  // Le prévisionnel occupe ce qui RESTE, jamais plus : planifier trois fois la
  // cible ne doit pas déborder de la barre ni repousser le plein.
  const plannedPct =
    max > 0 ? Math.min(100 - filled, Math.round((planned / max) * 100)) : 0
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {label != null && (
        // `inline-flex items-center` : le libellé mêle du texte et de petits
        // éléments (emoji d'unité, compteur « +2 »). Alignés sur la ligne de
        // base, ils pendent sous les chiffres — un emoji descend sous la
        // baseline. Centrés, ils s'accordent quelle que soit leur taille.
        <span className="inline-flex shrink-0 items-center text-xs tabular-nums text-muted-foreground">
          {label}
        </span>
      )}
      {/* `flex` plutôt qu'un segment posé en absolu : les deux morceaux se
          suivent naturellement, et le prévisionnel démarre exactement là où le
          plein s'arrête, sans recalculer d'offset. */}
      <div className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-all duration-500',
            barClassName ?? 'bg-primary',
          )}
          style={{ width: `${filled}%` }}
        />
        {plannedPct > 0 && (
          <div
            title={plannedTitle}
            className={cn(
              // La même couleur que le plein, simplement moins vive : la teinte
              // dit à quel domaine appartient la barre, l'intensité dit si
              // c'est acquis ou seulement prévu. Une trame (rayures, points)
              // ajoutait un troisième signal là où deux suffisent, et sur 8 px
              // de haut elle se lisait surtout comme du bruit.
              'h-full opacity-35 transition-all duration-500',
              barClassName ?? 'bg-primary',
            )}
            style={{ width: `${plannedPct}%` }}
          />
        )}
      </div>
      {trailing !== undefined ? (
        trailing
      ) : (
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {pct}%
        </span>
      )}
    </div>
  )
}
