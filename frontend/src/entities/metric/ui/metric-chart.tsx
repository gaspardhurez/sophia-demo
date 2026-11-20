import { useState } from 'react'

import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'
import {
  formatValue,
  isTimeUnit,
  unitLabel,
  type UnitLike,
} from '@/shared/lib/units'
import { useElementWidth } from '@/shared/lib/use-element-width'
import { cn } from '@/shared/lib/utils'

import { useMetricValues } from '../api/queries'
import type { Metric, MetricValue } from '../model/types'

/** Hauteur du dessin, mois compris (kit/Releves). */
const H = 200
/** Le cadre du tracé : 14 px au-dessus, 20 px sous la ligne de base pour les
 *  mois, 6 px à droite. La gauche porte les valeurs. */
const TOP = 14
const BASE = H - 20
const RIGHT_PAD = 6
/** Gouttière des valeurs, au moins celle de la maquette. */
const MIN_LEFT = 34

/**
 * Pas d'une échelle de DURÉE, en secondes. Le décimal n'a pas cours ici : un axe
 * gradué tous les 2,5 donnerait « 2:30 · 5:00 · 7:30 », lisible par accident, et
 * tous les 0,25 donnerait « 0:15 » — juste, mais sur une suite que personne ne
 * lit. Le temps se découpe en 15 s, en minutes et en quarts d'heure.
 */
const DURATION_STEPS = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 86400,
]

/**
 * Des graduations sur des nombres ronds (10 · 20 · 30), jamais sur les valeurs
 * brutes : une échelle qui affiche « 117,5 » demande à être lue, une échelle
 * ronde se lit d'un coup. Sur une durée, « rond » ne veut pas dire décimal —
 * d'où `DURATION_STEPS`, exprimé en secondes puis ramené à l'unité.
 */
function niceTicks(
  lo: number,
  hi: number,
  unit: UnitLike | null | undefined,
  count = 4,
): number[] {
  const raw = (hi - lo) / count
  let step: number
  if (isTimeUnit(unit)) {
    const perUnit = unit!.seconds_per_unit!
    const rawSeconds = raw * perUnit
    step =
      (DURATION_STEPS.find((s) => rawSeconds <= s) ??
        Math.ceil(rawSeconds / 86400) * 86400) / perUnit
  } else {
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    step =
      ([1, 2, 2.5, 5, 10].find((m) => raw <= m * magnitude) ?? 10) * magnitude
  }
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + step / 1000; t += step) {
    // Le cumul de flottants fait dériver le pas (0.30000000000000004).
    ticks.push(Math.round(t / step) * step)
  }
  return ticks
}

/**
 * Le trait lissé qui passe par tous les points, en cubique **monotone**
 * (Fritsch–Carlson, la `curveMonotoneX` de d3) : entre deux relevés il ne
 * dépasse jamais ni l'un ni l'autre. Une spline de Catmull-Rom, elle, plonge
 * sous deux relevés égaux (60, 60, 70 dessinait un creux sous 60 qui n'a pas
 * eu lieu).
 */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length
  if (n < 3)
    return pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0])
  const sl = pts
    .slice(1)
    .map((p, i) => (dx[i] === 0 ? 0 : (p[1] - pts[i][1]) / dx[i]))
  // Pente en chaque point : nulle à un extrême local, moyenne harmonique sinon.
  const m = pts.map((_, i) => {
    if (i === 0) return sl[0]
    if (i === n - 1) return sl[n - 2]
    const a = sl[i - 1]
    const b = sl[i]
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b)
  })
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${pts[i][0] + h} ${pts[i][1] + m[i] * h} ${pts[i + 1][0] - h} ${pts[i + 1][1] - m[i + 1] * h} ${pts[i + 1][0]} ${pts[i + 1][1]}`
  }
  return d
}

const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime()
const DAY_MS = 86_400_000
const monthShort = (d: Date) =>
  d.toLocaleDateString('fr-FR', { month: 'short' })

interface MetricChartProps {
  metric: Metric
  /** La cible visée : pointillé à l'encre, drapeau et valeur à droite. */
  target?: number
  /** Le départ du fil : pointillé gris, épingle et valeur à droite. */
  start?: number | null
  /** Bornes de la saison : l'axe des temps, et les seuls relevés montrés. */
  from?: string
  to?: string
  /**
   * La teinte du passé de la saison (couleur CSS, la base du domaine) — un
   * lavis léger jusqu'à aujourd'hui. Sans saison, rien à teinter.
   */
  tint?: string
  /**
   * Classe de couleur du texte (l'encre du domaine). Le tracé est en
   * `currentColor` : la palette reste au même endroit que partout ailleurs,
   * plutôt qu'en valeur recopiée dans du SVG.
   */
  className?: string
  /** Le relevé survolé sur la courbe, pour que la liste voisine le montre. */
  onHoverValue?: (valueId: string | null) => void
}

/**
 * Les relevés d'une métrique dans le temps (design #43, kit/Releves).
 *
 * **L'axe des temps est la saison** quand elle est connue : les points tombent
 * où ils ont eu lieu dans la période, et le blanc à droite est le temps qu'il
 * reste ; le passé est teinté. Sans saison (page domaine), les mois qui
 * contiennent les relevés. Un filet pointillé par mois, un tiret sur la ligne de base ; pas de
 * grille horizontale, pas de trait d'aujourd'hui.
 *
 * **Vers le haut = mieux**, quel que soit le sens de la métrique : sur un temps,
 * l'axe s'inverse, et une progression monte toujours.
 *
 * Trait lissé à l'encre, points creux. La **cible** en pointillé à l'encre avec
 * son drapeau, le **départ** en pointillé gris avec son épingle (la graduation
 * qui le touche s'efface). Le **record** porte sa valeur dans une bulle et un
 * anneau : c'est lui qui décide qu'une cible est atteinte. Le survol donne la
 * valeur et la date du relevé le plus proche.
 *
 * **Dessiné en pixels réels** — largeur mesurée, une unité SVG = un pixel : un
 * `viewBox` fixe étiré au conteneur mettrait les étiquettes à l'échelle.
 */
export function MetricChart({
  metric,
  target,
  start = null,
  from,
  to,
  tint,
  className,
  onHoverValue,
}: MetricChartProps) {
  const { data: values, isPending } = useMetricValues(metric.id)
  const [wrapperRef, width] = useElementWidth<HTMLDivElement>()
  const [hovered, setHovered] = useState<number | null>(null)

  const points = (values ?? []).filter(
    (v) =>
      (from == null || v.measured_at >= from) &&
      (to == null || v.measured_at <= to),
  )
  const season = from != null && to != null

  if (isPending)
    return (
      <div
        className="animate-pulse rounded bg-muted/50"
        style={{ height: H }}
        aria-hidden
      />
    )

  // Sans relevé, il reste à dessiner ce qu'on vise (la cible, le départ) ;
  // sans rien de tout ça, seul un message.
  if (points.length === 0 && target == null && start == null)
    return (
      <p
        className="flex items-center justify-center text-center text-sm text-muted-foreground"
        style={{ height: H }}
      >
        {from != null
          ? 'Aucun relevé sur la période.'
          : 'Aucun relevé pour l’instant.'}
      </p>
    )

  // Premier rendu : la largeur n'est pas encore mesurée. On réserve la place
  // plutôt que de dessiner à 0 — sinon le panneau saute d'une image à l'autre.
  if (width === 0)
    return <div ref={wrapperRef} style={{ height: H }} aria-hidden />

  const down = metric.direction === 'down'
  const better = (a: number, b: number) => (down ? a < b : a > b)
  const fmt = (v: number) => formatValue(v, metric.unit)
  const withUnit = (v: number) =>
    `${fmt(v)} ${unitLabel(metric.unit, v)}`.trimEnd()

  // L'échelle : la cible, le départ et les relevés y entrent tous — un repère
  // hors cadre ne dirait pas s'il reste dix kilos à prendre ou cent.
  const scale = [
    ...(target != null ? [target] : []),
    ...(start != null ? [start] : []),
    ...points.map((p) => p.value),
  ]
  let lo0 = Math.min(...scale)
  let hi0 = Math.max(...scale)
  if (lo0 === hi0) {
    lo0 = 0
    hi0 = hi0 * 1.2 || 1
  }
  const margin = (hi0 - lo0) * 0.15
  const lo = lo0 - margin
  const hi = hi0 + margin

  const ticks = niceTicks(lo, hi, metric.unit).filter((t) => t >= lo && t <= hi)
  const left = Math.max(
    MIN_LEFT,
    Math.max(0, ...ticks.map((t) => fmt(t).length)) * 6 + 10,
  )
  const right = width - RIGHT_PAD
  const y = (v: number) => {
    const r = (v - lo) / (hi - lo)
    return down ? TOP + r * (BASE - TOP) : BASE - r * (BASE - TOP)
  }

  // L'axe des temps : la saison, sinon l'étendue des relevés.
  let t0 = season
    ? day(from)
    : day(points[0]?.measured_at ?? toDateISO(new Date()))
  let t1 = season
    ? day(to)
    : day(points[points.length - 1]?.measured_at ?? toDateISO(new Date()))
  if (!season) {
    // Sans saison, l'axe s'arrondit aux mois qui contiennent les relevés :
    // les mois s'écrivent en pied, là où des bornes brutes n'en montreraient
    // aucun.
    const a = new Date(t0)
    const b = new Date(t1)
    t0 = new Date(a.getFullYear(), a.getMonth(), 1, 12).getTime()
    t1 = new Date(b.getFullYear(), b.getMonth() + 1, 1, 12).getTime()
  }
  if (t1 - t0 < DAY_MS) {
    t0 -= 15 * DAY_MS
    t1 += 15 * DAY_MS
  }
  const x = (t: number) => left + ((t - t0) / (t1 - t0)) * (right - left)

  const months: { x: number; label: string; key: string }[] = []
  const first = new Date(t0)
  for (
    let d = new Date(first.getFullYear(), first.getMonth(), 1, 12);
    d.getTime() <= t1;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)
  )
    months.push({
      x: x(d.getTime()),
      label: monthShort(d),
      key: `${d.getFullYear()}-${d.getMonth()}`,
    })

  const xs = points.map((p) => x(day(p.measured_at)))
  const ys = points.map((p) => y(p.value))
  const rec = points.reduce<MetricValue | null>(
    (acc, p) => (acc === null || better(p.value, acc.value) ? p : acc),
    null,
  )
  const recIndex = rec ? points.indexOf(rec) : -1

  const yStart = start != null ? y(start) : null
  const yTarget = target != null ? y(target) : null
  // La graduation qui tomberait sur le départ s'efface : son libellé y est.
  const yLabels = ticks.filter(
    (t) => yStart === null || Math.abs(y(t) - yStart) >= 12,
  )
  const passedW = season
    ? Math.min(right, Math.max(left, x(day(toDateISO(new Date()))))) - left
    : 0

  const hp = hovered !== null ? points[hovered] : null

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (points.length === 0) return
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    let k = 0
    xs.forEach((q, i) => {
      if (Math.abs(q - px) < Math.abs(xs[k] - px)) k = i
    })
    if (k !== hovered) {
      setHovered(k)
      onHoverValue?.(points[k].id)
    }
  }
  function onLeave() {
    setHovered(null)
    onHoverValue?.(null)
  }

  const label =
    'absolute flex items-center gap-[3px] rounded-[3px] bg-card px-[3px] py-px text-[10px] leading-none font-semibold whitespace-nowrap tabular-nums'

  return (
    <div
      ref={wrapperRef}
      className={cn('relative', className)}
      style={{ height: H }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <svg
        width={width}
        height={H}
        className="absolute inset-0 block overflow-visible"
        role="img"
        aria-label={
          points.length
            ? `Évolution de ${metric.name} : ${points.length} relevés, de ${fmt(points[0].value)} le ${formatDateShort(points[0].measured_at)} à ${fmt(points[points.length - 1].value)} le ${formatDateShort(points[points.length - 1].measured_at)}. Record : ${fmt(rec!.value)}.${target != null ? ` Cible : ${fmt(target)}.` : ''}`
            : `${metric.name} : aucun relevé.${target != null ? ` Cible : ${fmt(target)}.` : ''}`
        }
      >
        {/* Le passé de la saison, en lavis. */}
        {passedW > 0 && (
          <rect
            x={left}
            y={TOP}
            width={passedW}
            height={BASE - TOP}
            fill={tint ?? 'currentColor'}
            fillOpacity={0.07}
          />
        )}

        {/* Un filet pointillé par mois, un tiret sur la ligne de base. */}
        {months
          .filter((m) => m.x > left + 1 && m.x < right)
          .map((m) => (
            <g key={m.key}>
              <line
                x1={m.x}
                x2={m.x}
                y1={TOP}
                y2={BASE}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <line
                x1={m.x}
                x2={m.x}
                y1={BASE}
                y2={BASE + 4}
                className="stroke-muted-foreground/45"
                strokeWidth={1}
              />
            </g>
          ))}

        <line
          x1={left}
          x2={right}
          y1={BASE}
          y2={BASE}
          className="stroke-muted-foreground/45"
          strokeWidth={1}
        />

        {yTarget !== null && (
          <line
            x1={left}
            x2={right}
            y1={yTarget}
            y2={yTarget}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {yStart !== null && (
          <line
            x1={left}
            x2={right}
            y1={yStart}
            y2={yStart}
            className="stroke-muted-foreground/45"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}

        {hp && (
          <line
            x1={xs[hovered!]}
            x2={xs[hovered!]}
            y1={TOP}
            y2={BASE}
            className="stroke-muted-foreground/50"
            strokeWidth={1}
          />
        )}

        {points.length > 0 && (
          <path
            d={smoothPath(xs.map((px, i) => [px, ys[i]]))}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {rec && (
          <circle
            cx={xs[recIndex]}
            cy={ys[recIndex]}
            r={8}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
        )}

        {points.map((p, i) => (
          <circle
            key={p.id}
            cx={xs[i]}
            cy={ys[i]}
            r={i === hovered ? 5 : 3.5}
            className="fill-card"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* Les valeurs à gauche, les mois en pied. */}
      {yLabels.map((t) => (
        <span
          key={t}
          className="absolute left-0 text-right text-[10px] leading-none whitespace-nowrap text-muted-foreground tabular-nums"
          style={{ top: y(t) - 5, width: left - 6 }}
        >
          {fmt(t)}
        </span>
      ))}
      {months
        .filter((m) => m.x >= left - 1 && m.x <= right - 24)
        .map((m) => (
          <span
            key={m.key}
            className="absolute bottom-0 text-[10px] leading-none whitespace-nowrap text-muted-foreground"
            style={{ left: m.x + 3 }}
          >
            {m.label}
          </span>
        ))}

      {target != null && yTarget !== null && (
        <span className={label} style={{ right: 6, top: yTarget - 16 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="size-2.5"
          >
            <path d="M5 22V4" />
            <path d="M5 4h12l-2.5 4L17 12H5" />
          </svg>
          {withUnit(target)}
        </span>
      )}
      {start != null && yStart !== null && (
        <span
          className={cn(label, 'text-muted-foreground')}
          style={{
            right: 6,
            // Collé sous la cible, il passe sous son trait au lieu de la
            // recouvrir.
            top:
              yTarget !== null &&
              Math.abs(yStart - yTarget) < 18 &&
              yStart > yTarget
                ? yStart + 4
                : yStart - 16,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            aria-hidden
            className="size-2.5"
          >
            <path d="M12 2a8 8 0 0 0-8 8c0 5.4 6.7 11.3 7.3 11.8a1 1 0 0 0 1.4 0C13.3 21.3 20 15.4 20 10a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
          </svg>
          {withUnit(start)}
        </span>
      )}

      {/* Le record en bulle, sauf au survol : l'infobulle prend le relais. */}
      {rec && !hp && (
        <span
          className="absolute -translate-x-1/2 -translate-y-full rounded-[4px] bg-current px-[5px] py-0.5 text-[10px] leading-[1.2] font-semibold whitespace-nowrap tabular-nums"
          style={{ left: xs[recIndex], top: ys[recIndex] - 8 }}
        >
          {/* Le fond est l'encre (`currentColor`) : claire en sombre. */}
          <span className="text-white dark:text-zinc-900">
            {fmt(rec.value)}
          </span>
        </span>
      )}

      {hp && (
        <span
          className="pointer-events-none absolute z-[5] flex -translate-x-1/2 translate-y-[calc(-100%-10px)] flex-col gap-px rounded-md border bg-popover px-2 py-1 whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: xs[hovered!], top: ys[hovered!] }}
        >
          <span className="text-[13px] font-semibold tabular-nums">
            {withUnit(hp.value)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatDateShort(hp.measured_at)}
          </span>
        </span>
      )}
    </div>
  )
}
