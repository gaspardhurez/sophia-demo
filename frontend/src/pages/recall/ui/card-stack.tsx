import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

import type { Leaving } from '../model/use-deck'

/** La carte au premier plan d'un paquet : la tranche des cartes dessous se
 *  voit en bas (`prod/Interro`). */
export const CARD =
  'flex flex-col rounded-2xl border border-border bg-card px-[22px] pt-4 pb-[18px] shadow-[0_2px_0_var(--color-border),0_4px_0_var(--color-card),0_5px_0_var(--color-border),0_7px_0_var(--color-card),0_8px_0_var(--color-border),0_20px_28px_-16px_oklch(0.21_0.008_285/0.4)]'

const FRONT = 'translate(0, 0) scale(1)'
const BACK = 'translate(0, 11px) scale(0.95)'

/**
 * Le paquet de cartes de la passation (#103) : la carte en jeu au premier
 * plan ; celle qu'on vient de juger (`leaving`) prend son tampon puis sort —
 * à droite pour une question sue (420 ms), sous le paquet sinon (≈ 640 ms) —,
 * pendant que la suivante, encore en retrait, monte prendre sa place
 * (≈ 400 ms).
 */
export function CardStack({
  children,
  leaving,
  exiting,
  inkColor,
}: {
  /** La carte en jeu (ou qui monte). */
  children: ReactNode
  leaving: Leaving | null
  /** Le tampon est posé : la carte jugée sort. */
  exiting: boolean
  /** L'encre du domaine, pour le tampon ✓. */
  inkColor: string
}) {
  const behind = leaving !== null
  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          transform: behind ? BACK : FRONT,
          transition: behind
            ? 'none'
            : 'transform 400ms cubic-bezier(.2,.7,.2,1)',
        }}
      >
        {children}
      </div>
      {leaving && (
        <div
          className="absolute inset-0 flex flex-col"
          style={exitStyle(leaving.kind, exiting)}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            {leaving.node}
            <Stamp kind={leaving.kind} label={leaving.label} ink={inkColor} />
          </div>
        </div>
      )}
    </div>
  )
}

function exitStyle(kind: Leaving['kind'], exiting: boolean): CSSProperties {
  if (!exiting) return { transform: FRONT, zIndex: 2 }
  if (kind === 'known')
    return {
      zIndex: 2,
      transform: 'translate(115%, -12px) rotate(8deg)',
      opacity: 0,
      transition:
        'transform 420ms cubic-bezier(.4,0,.6,1), opacity 420ms ease-in',
    }
  // Ratée : elle descend, puis passe sous le paquet.
  return {
    zIndex: 0,
    transform: 'translate(0, 70px) scale(0.93)',
    opacity: 0,
    transition:
      'transform 640ms cubic-bezier(.2,.7,.2,1), opacity 520ms ease 120ms',
  }
}

/** Le tampon : un cercle de 88 px, bord 3 px, penché de 12° — ✓ à l'encre
 *  du domaine, ✕ rouge, « 2/3 » ambre pour une liste en partie donnée. */
function Stamp({
  kind,
  label,
  ink,
}: {
  kind: Leaving['kind']
  label: string
  ink: string
}) {
  // « On reprend » sort comme un Su, sans tampon.
  if (!label) return null
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 left-1/2 -mt-11 -ml-11 grid size-[88px] animate-stamp place-items-center rounded-full border-[3px] bg-card font-heading font-bold',
        kind === 'known' && 'text-[40px]',
        kind === 'missed' &&
          'border-red-500 text-[40px] text-red-600 dark:border-red-400 dark:text-red-400',
        kind === 'partial' &&
          'border-amber-500 text-[28px] text-amber-700 dark:border-amber-400 dark:text-amber-300',
      )}
      style={kind === 'known' ? { borderColor: ink, color: ink } : undefined}
    >
      {label}
    </span>
  )
}
