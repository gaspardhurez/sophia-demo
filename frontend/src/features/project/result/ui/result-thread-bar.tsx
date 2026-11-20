import { useLayoutEffect, useRef, useState } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'

import { TargetFlag } from './result-thread'

/** Où la bulle du record s'est posée, mesuré sur le fil. */
interface BubbleEdge {
  /** Le repère dont la bulle prend la place, s'il y en a un. */
  side: 'start' | 'target' | null
  /** Position gauche de la bulle, en px depuis le bord du fil. */
  left: number
}

/**
 * Les deux montages du fil : dans l'en-tête du projet (kit/Suivi), la
 * barre court sur toute la carte et les repères se posent à 8 px des bords ;
 * dans le panneau des relevés (kit/Releves), le fil est en retrait et les
 * repères au ras de ses bouts.
 */
const VARIANTS = {
  header: {
    inset: 8,
    area: 'h-6',
    bar: '',
    label: 'bottom-1',
    bubble: 'bottom-1.5',
    flag: 12,
    flagClass: 'size-3',
    pin: 'size-[11px]',
  },
  panel: {
    inset: 0,
    area: 'h-5',
    bar: 'rounded-sm',
    label: 'bottom-1.5',
    bubble: 'bottom-1',
    flag: 11,
    flagClass: 'size-[11px]',
    pin: 'size-2.5',
  },
} as const

/**
 * Le fil d'un Résultat en barre (design #36, kit/Suivi ; repris par le panneau
 * des relevés, #43) : la barre se remplit jusqu'au record, une bulle à
 * l'encre porte sa valeur au-dessus du bout ; le départ et son épingle à
 * gauche, la cible et son drapeau à droite. Sans record, ni bulle ni
 * remplissage.
 *
 * **La bulle est bornée au fil** et, quand elle touche le départ ou la cible,
 * elle **prend la place de leur étiquette** : l'étiquette du départ s'efface, ou la valeur de la cible —
 * son drapeau reste. Elle reste à l'encre du domaine, recul compris : le
 * rouge du recul est celui de la carte, pas celui du fil.
 */
export function ResultThreadBar({
  pct,
  start,
  record,
  target,
  reached,
  color,
  variant = 'header',
  className,
}: {
  /** Jusqu'où le fil est parcouru, de 0 à 100 (`resultThread().filled`). */
  pct: number
  /** Le départ écrit, s'il y en a un. */
  start: string | null
  /** Le record écrit, dans la bulle ; `null` sans relevé. */
  record: string | null
  /** La cible écrite, devant le drapeau. */
  target: string
  reached: boolean
  color: DomainColorClasses
  variant?: keyof typeof VARIANTS
  className?: string
}) {
  const v = VARIANTS[variant]
  const bar = useRef<HTMLSpanElement>(null)
  const startRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const targetRef = useRef<HTMLSpanElement>(null)
  const [edge, setEdge] = useState<BubbleEdge | null>(null)

  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => {
      const bubble = bubbleRef.current
      if (!bubble) return setEdge(null)
      const W = el.offsetWidth
      const bw = bubble.offsetWidth
      const x = (pct / 100) * W
      const dw = startRef.current?.offsetWidth ?? 0
      // La valeur de la cible, et l'écart de 3 px qui la sépare du drapeau.
      const cw = targetRef.current ? targetRef.current.offsetWidth + 3 : 0
      const l = Math.max(v.inset, Math.min(W - v.inset - bw, x - bw / 2))
      let next: BubbleEdge
      if (dw && l < v.inset + dw + 4) next = { side: 'start', left: l }
      else if (cw && l + bw > W - v.inset - v.flag - cw - 4)
        // La valeur s'efface, le drapeau reste : la bulle s'arrête devant lui.
        next = {
          side: 'target',
          left: Math.min(
            Math.max(v.inset, x - bw / 2),
            W - v.inset - v.flag - 4 - bw,
          ),
        }
      else next = { side: null, left: l }
      setEdge((prev) =>
        prev && prev.side === next.side && prev.left === next.left
          ? prev
          : next,
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pct, start, record, target, v])

  return (
    <span
      ref={bar}
      className={cn('relative flex h-1 bg-muted', v.bar, className)}
    >
      <span
        className={cn('transition-[width] duration-250', v.bar, color.dot)}
        style={{ width: `${record ? pct : 0}%` }}
      />
      {/* Les repères, dans l'espace réservé au-dessus de la barre. */}
      <span className={cn('absolute inset-x-0 bottom-full', v.area)}>
        {start && (
          <span
            ref={startRef}
            title="Départ"
            className={cn(
              'absolute flex items-center gap-[3px] text-[10px] leading-none font-semibold text-muted-foreground tabular-nums',
              v.label,
              edge?.side === 'start' && 'invisible',
            )}
            style={{ left: v.inset }}
          >
            <StartPin className={v.pin} />
            {start}
          </span>
        )}
        {record && (
          <span
            ref={bubbleRef}
            className={cn(
              'absolute z-[4] rounded-[4px] px-[5px] py-0.5 text-[10px] leading-[1.2] font-semibold whitespace-nowrap text-white tabular-nums transition-[left] duration-250',
              v.bubble,
              !edge && '-translate-x-1/2',
              color.ink,
            )}
            style={{ left: edge ? edge.left : `${pct}%` }}
          >
            {record}
          </span>
        )}
        <span
          title="Cible"
          className={cn(
            'absolute flex items-center gap-[3px] text-[10px] leading-none font-semibold tabular-nums',
            v.label,
            reached ? color.text : 'text-muted-foreground',
          )}
          style={{ right: v.inset }}
        >
          <span
            ref={targetRef}
            className={cn(edge?.side === 'target' && 'invisible')}
          >
            {target}
          </span>
          <TargetFlag
            className={cn('shrink-0', v.flagClass)}
            filled={reached}
          />
        </span>
      </span>
    </span>
  )
}

/** Le départ du fil : une épingle pleine (kit/Suivi), évidée en son centre. */
export function StartPin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={className}
    >
      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 6.7 11.3 7.3 11.8a1 1 0 0 0 1.4 0C13.3 21.3 20 15.4 20 10a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  )
}
