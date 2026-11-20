import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

import { unavailableLine } from '../lib/unavailable-line'
import { type StepKey, STEPS } from '../model/steps'

/**
 * Les étapes, à droite du titre : la courante sur fond, son numéro foncé ;
 * une étape passée porte ✓ ; les autres, un numéro cerclé. Sous `sm`, seul
 * le libellé de la courante reste (la modale y est étroite).
 */
export function StepsBar({
  current,
  passed,
}: {
  current: StepKey
  passed: ReadonlySet<StepKey>
}) {
  return (
    <ol className="ml-1 flex items-center gap-0.5">
      {STEPS.map(({ key, label }, i) => {
        const on = key === current
        const done = !on && passed.has(key)
        return (
          <li
            key={key}
            aria-current={on ? 'step' : undefined}
            className={cn(
              'inline-flex h-[22px] items-center gap-[5px] rounded-full pr-2 pl-1 text-[11.5px] font-medium',
              on ? 'bg-foreground/[0.045]' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-3.5 place-items-center rounded-full text-[9px] font-bold',
                on && 'bg-foreground text-background',
                done && 'bg-foreground/10 text-foreground/80',
                !on && !done && 'ring-[1.2px] ring-foreground/20 ring-inset',
              )}
            >
              {done ? <Check className="size-2.5" strokeWidth={3.5} /> : i + 1}
            </span>
            <span className={cn(!on && 'max-sm:sr-only')}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Le pied d'un temps : à gauche ce qui revient, à droite ce qui avance. */
export function Footer({
  start,
  children,
}: {
  start?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 border-t border-foreground/[0.05] px-[18px] pt-3 pb-4">
      {start}
      <span className="flex-1" />
      {children}
    </div>
  )
}

/** Sophia écrit : trois points roses qui battent (`prod/Cadrer etude`). */
export function SophiaDots() {
  return (
    <span aria-hidden className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-[#C98AA8]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}

/**
 * Une proposition de Sophia qui n'a pas abouti : le message en rouge dans
 * un liseré, et Réessayer (`prod/Cadrer etude`, « Sophia ne répond pas »).
 */
export function ErrorLine({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 self-start rounded-[10px] py-[7px] pr-2 pl-3 text-[13px] text-destructive ring-1 ring-destructive/25 ring-inset"
    >
      {message}
      <button
        type="button"
        onClick={onRetry}
        className="h-[26px] cursor-pointer rounded-md bg-background px-[9px] text-[12.5px] font-medium text-foreground ring-1 ring-border ring-inset hover:bg-foreground/[0.03]"
      >
        Réessayer
      </button>
    </div>
  )
}

/**
 * Une aide de Sophia indisponible (sans compagnon) : une ligne grisée en
 * pointillés, 🧠 estompé, « … indisponible — motif » ; le motif entier en
 * infobulle.
 */
export function UnavailableNote({
  label,
  reason,
}: {
  label: string
  reason: string | null
}) {
  return (
    <div
      title={reason ?? undefined}
      className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[13px] text-muted-foreground/80"
    >
      <span aria-hidden className="opacity-50">
        🧠
      </span>
      {unavailableLine(label, reason)}
    </div>
  )
}
