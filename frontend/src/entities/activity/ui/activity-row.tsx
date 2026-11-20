import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'
import { DoneMark } from '@/shared/ui'

/** Où en est une séance : faite, due (échue et non faite), ou simplement à venir. */
export type ActivityState = 'done' | 'due' | 'todo'

/**
 * La pastille d'état d'une séance — 15px, trois formes.
 *
 * Le pointillé rouge ne dit pas « échec » mais « c'était pour aujourd'hui » :
 * rien n'est irréversible, un clic la coche encore.
 *
 * L'état *fait* est rendu par `DoneMark`, la coche unique du produit : cette
 * pastille en portait déjà le dessin exact, c'est elle qui a servi de modèle au
 * kit. Elle ne le redessine donc plus, elle l'appelle — les deux ne peuvent
 * plus diverger. Les deux autres états, eux, restent ici : le kit les décrit
 * comme ceux d'`ActivityStateDot`, ils n'appartiennent à aucune autre surface.
 */
export function ActivityStateDot({
  state,
  dense,
  inkClassName,
}: {
  state: ActivityState
  dense?: boolean
  /** Encre du domaine (`domainColor(...).ink`) ; sombre à défaut. */
  inkClassName?: string
}) {
  const size = dense ? 'size-[13px]' : 'size-[15px]'
  if (state === 'done')
    return (
      <DoneMark size={dense ? 'rowDense' : 'row'} className={inkClassName} />
    )
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-full border-[1.5px]',
        size,
        state === 'due' ? 'border-dashed border-rose-500/70' : 'border-ring/60',
      )}
    />
  )
}

/**
 * Une ligne de séance — le format de l'agenda, partagé par les écrans qui
 * projettent le calendrier.
 *
 * Purement présentationnelle : elle ne sait ni charger ni cocher. Ce qu'elle
 * tient, c'est le gabarit — pastille, emoji, titre tronqué, information à
 * droite — pour que deux écrans qui montrent la même chose la montrent pareil.
 */
export function ActivityRow({
  leading,
  emoji,
  title,
  trailing,
  state = 'todo',
  onClick,
  dense = false,
}: {
  /** Remplace la pastille — la colonne de date des échéances à venir. */
  leading?: ReactNode
  emoji?: string | null
  title: string
  trailing?: ReactNode
  state?: ActivityState
  onClick?: () => void
  /** Le panneau latéral : mêmes informations, un cran plus serré. */
  dense?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex w-full items-center border-b border-border/60 text-left last:border-b-0',
        dense ? 'gap-[7px] px-3 py-1.5' : 'gap-[9px] px-[18px] py-2.5',
        state === 'due' && 'shadow-[inset_2px_0_0_0_var(--color-rose-500)]',
        onClick && 'hover:bg-muted/40',
      )}
    >
      {leading ?? <ActivityStateDot state={state} dense={dense} />}
      {emoji && (
        <span
          className={cn(
            'shrink-0 leading-none',
            dense ? 'text-xs' : 'text-[13px]',
          )}
        >
          {emoji}
        </span>
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate leading-tight',
          dense ? 'text-xs' : 'text-[13px]',
          state === 'done' && 'text-muted-foreground line-through',
        )}
      >
        {title}
      </span>
      {trailing}
    </Tag>
  )
}
