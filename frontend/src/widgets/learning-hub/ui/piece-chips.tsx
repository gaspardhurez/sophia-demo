import { ChevronUp } from 'lucide-react'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import type { SessionChip } from '../model/rows'

/** Écart entre deux étiquettes, et place gardée pour « +n » (la maquette). */
const GAP = 4
const PLUS_W = 36

/** La teinte d'une étiquette : celle d'une séance faite du bloc Séances
 *  (`pieceTone`, page savoir) — le domaine à 14 %, par transparence. */
const tint = (base: string) => `color-mix(in oklch, ${base} 14%, transparent)`

/** Le calque du survol couvre ses voisines : la même teinte, posée sur la
 *  carte pour être opaque. */
const opaqueTint = (base: string): CSSProperties['background'] =>
  `linear-gradient(${tint(base)}, ${tint(base)}), var(--card)`

/**
 * Les pièces d'une séance en étiquettes (#165, `prod/Apprentissage`) : emoji
 * et nom, au fond teinté du domaine de leur savoir, sans état. **Une ligne** :
 * autant qu'il en tient, puis « +n » (survol : les autres ; clic : toutes, sur
 * plusieurs lignes ; ⌃ replie), recalculé quand la largeur change. Un clic
 * sur une étiquette ouvre la fiche de sa pièce (27/10) ; l'étude, qui n'a
 * pas de fiche, ouvre les notes du savoir.
 *
 * Survol (ou focus) : un calque par-dessus l'étiquette, à sa place, qui
 * s'allonge en douceur sur « · savoir » sans déplacer les voisines — borné à
 * la ligne de la séance (`[data-session-row]`) et à la fenêtre : il glisse à
 * gauche s'il manque de place, le savoir se coupe en « … ». Il se ferme au
 * défilement.
 */
export function PieceChips({
  chips,
  onOpen,
}: {
  chips: SessionChip[]
  onOpen: (chip: SessionChip, anchor: DOMRect) => void
}) {
  const [open, setOpen] = useState(false)
  const [fit, setFit] = useState(chips.length)
  const boxRef = useRef<HTMLDivElement>(null)
  const mesRef = useRef<HTMLDivElement>(null)
  const [bubble, setBubble] = useState<Bubble | null>(null)

  const measure = useCallback(() => {
    const box = boxRef.current
    const mes = mesRef.current
    if (!box || !mes) return
    const W = box.clientWidth
    const widths = [...mes.children].map((c) => (c as HTMLElement).offsetWidth)
    let x = 0
    let k = 0
    for (let j = 0; j < widths.length; j++) {
      const nx = x + (j ? GAP : 0) + widths[j]
      const rest = widths.length - j - 1
      if (nx + (rest ? GAP + PLUS_W : 0) > W) break
      x = nx
      k = j + 1
    }
    setFit(Math.max(1, k))
  }, [])

  useLayoutEffect(() => {
    measure()
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [measure, chips])

  // Le calque se ferme au défilement (n'importe où).
  useEffect(() => {
    if (!bubble) return
    const close = () => setBubble(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [bubble])

  const shown = open ? chips : chips.slice(0, fit)
  const hidden = chips.slice(shown.length)

  function hover(el: HTMLElement, chip: SessionChip) {
    setBubble(bubbleFor(el, chip))
  }

  return (
    <div className="relative min-w-0">
      <div
        ref={boxRef}
        className={`flex min-w-0 gap-1 ${open ? 'flex-wrap' : 'flex-nowrap'}`}
      >
        {shown.map((chip) => (
          <button
            key={chip.key}
            type="button"
            data-session-open
            aria-label={`${chip.title} · ${chip.skill}`}
            onClick={(e) =>
              onOpen(chip, e.currentTarget.getBoundingClientRect())
            }
            onMouseEnter={(e) => hover(e.currentTarget, chip)}
            onMouseLeave={() => setBubble(null)}
            onFocus={(e) => hover(e.currentTarget, chip)}
            onBlur={() => setBubble(null)}
            className="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-md border border-transparent pr-2 pl-1.5 text-[12.5px] whitespace-nowrap transition-[filter] hover:brightness-[0.96] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            style={{
              background: tint(chip.colors.base),
              color: chip.colors.ink,
            }}
          >
            <span className="mr-[5px] text-[13px]">{chip.emoji}</span>
            <span>{chip.title}</span>
          </button>
        ))}
        {hidden.length > 0 && (
          <button
            type="button"
            title={hidden.map((c) => `${c.emoji} ${c.title}`).join('\n')}
            onClick={() => setOpen(true)}
            className="inline-flex h-6 shrink-0 items-center rounded-md border bg-card px-[7px] text-xs font-semibold text-foreground/70 hover:bg-muted"
          >
            +{hidden.length}
          </button>
        )}
        {open && (
          <button
            type="button"
            aria-label="Replier"
            title="Replier"
            onClick={() => setOpen(false)}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronUp className="size-3.5" />
          </button>
        )}
      </div>

      {/* La mesure : toutes les étiquettes, invisibles, sur une ligne. */}
      <div
        ref={mesRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex gap-1 whitespace-nowrap"
      >
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex h-6 items-center border border-transparent pr-2 pl-1.5 text-[12.5px]"
          >
            <span className="mr-[5px] text-[13px]">{chip.emoji}</span>
            <span>{chip.title}</span>
          </span>
        ))}
      </div>

      {bubble && createPortal(<BubbleLayer bubble={bubble} />, document.body)}
    </div>
  )
}

interface Bubble {
  key: string
  chip: SessionChip
  /** L'étiquette, à sa place. */
  x: number
  y: number
  w: number
  /** Le calque allongé. */
  x1: number
  w1: number
}

let ctx: CanvasRenderingContext2D | null = null

/** Où poser le calque : sur l'étiquette, allongé de « · savoir », borné à la
 *  ligne de la séance et à la fenêtre. */
function bubbleFor(el: HTMLElement, chip: SessionChip): Bubble {
  const r = el.getBoundingClientRect()
  const row = el.closest('[data-session-row]')?.getBoundingClientRect()
  const L = Math.max(8, row?.left ?? 8)
  const R = Math.min(window.innerWidth - 8, row?.right ?? window.innerWidth - 8)
  ctx ??= document.createElement('canvas').getContext('2d')
  let extra = 0
  if (ctx) {
    ctx.font = `400 12.5px ${getComputedStyle(el).fontFamily}`
    extra = ctx.measureText(`· ${chip.skill}`).width
  }
  const w1 = Math.min(R - L, r.width + 5 + extra + 2)
  const x1 = Math.max(L, Math.min(r.left, R - w1))
  return { key: chip.key, chip, x: r.left, y: r.top, w: r.width, x1, w1 }
}

/** Le calque : il naît à la taille de l'étiquette, puis s'allonge. */
function BubbleLayer({ bubble }: { bubble: Bubble }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let b = 0
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setOn(true))
    })
    return () => {
      cancelAnimationFrame(a)
      cancelAnimationFrame(b)
    }
  }, [])
  const { chip } = bubble
  return (
    <span
      aria-hidden
      className="pointer-events-none fixed z-[80] flex h-6 items-center overflow-hidden rounded-md border border-transparent pr-2 pl-1.5 brightness-[0.96] text-[12.5px] whitespace-nowrap transition-[left,width,box-shadow] duration-[240ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
      style={{
        background: opaqueTint(chip.colors.base),
        color: chip.colors.ink,
        top: bubble.y,
        left: on ? bubble.x1 : bubble.x,
        width: on ? bubble.w1 : bubble.w,
        boxShadow: on
          ? '0 2px 8px -2px oklch(0.21 0.008 285 / 0.22)'
          : undefined,
      }}
    >
      <span className="mr-[5px] shrink-0 text-[13px]">{chip.emoji}</span>
      <span className="shrink-0">{chip.title}</span>
      <span className="min-w-0 truncate pl-[5px] opacity-80">
        · {chip.skill}
      </span>
    </span>
  )
}
