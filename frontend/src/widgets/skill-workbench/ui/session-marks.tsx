import type { MouseEvent } from 'react'

import { cn } from '@/shared/lib/utils'
import { DoneMark } from '@/shared/ui'

import type { SessionState, StripPiece } from '../model/sessions'
import { type SessionColors, tone } from './session-tone'

/**
 * Les pièces communes du bloc Séances et de la liste du jour (#160,
 * `kit/Seances savoir`) : la marque d'état d'une séance, l'étiquette d'une
 * pièce.
 */

/** La marque d'état : la coche à l'encre du domaine (faite), le rond rouge
 *  (passée non faite), le rond pointillé (à venir). */
export function StateMark({
  state,
  small = false,
}: {
  state: SessionState
  /** 14 px (la liste du jour) au lieu de 16. */
  small?: boolean
}) {
  if (state === 'done')
    return (
      <DoneMark
        size={small ? 'block' : 'row'}
        className={cn('bg-(--sessions-ink)', !small && 'size-4')}
      />
    )
  return (
    <span
      aria-hidden
      className={cn(
        'box-border shrink-0 rounded-full border-[1.5px]',
        small ? 'size-3.5' : 'size-4',
        state === 'late' ? 'border-red-500' : 'border-dashed border-ring',
      )}
    />
  )
}

/** L'étiquette d'une pièce : son emoji et son nom, entiers ; un clic ouvre
 *  la séance qui la porte (survol : le nom de la séance). */
export function PieceChip({
  piece,
  state,
  colors,
  session,
  onClick,
}: {
  piece: StripPiece
  state: SessionState
  colors: SessionColors
  /** Le nom de la séance, au survol. */
  session: string
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const t = tone(state, colors)
  return (
    <button
      type="button"
      data-session-open
      title={session}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 max-w-full shrink-0 cursor-pointer items-center border border-transparent gap-[5px] truncate rounded-md pr-2 pl-1.5 text-[12.5px] whitespace-nowrap transition-[filter] hover:brightness-[0.96] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        t.className,
      )}
      style={t.style}
    >
      <span className="text-[13px]">{piece.emoji}</span>
      <span className="truncate">{piece.title}</span>
    </button>
  )
}
