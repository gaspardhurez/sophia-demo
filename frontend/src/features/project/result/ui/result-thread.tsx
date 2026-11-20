import { type ProjectMetric, resultThread } from '@/entities/metric'
import type { Project } from '@/entities/project'
import { formatValue } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

/** Un palier : ce qu'une étape vise sur la métrique, en chemin vers la cible. */
interface Palier {
  n: number
  title: string
  value: number
}

/** Les paliers que les étapes posent sur cette métrique, dans l'ordre du plan. */
export function paliersOf(project: Project, metricId: string): Palier[] {
  return [...project.steps]
    .sort((a, b) => a.order - b.order)
    .flatMap((step, i) =>
      step.metrics
        .filter((m) => m.metric_id === metricId && m.target !== null)
        .map((m) => ({
          n: i + 1,
          title: step.title,
          value: m.target as number,
        })),
    )
}

/**
 * Le **fil** d'un résultat visé (design #27) : du
 * départ au drapeau, jalonné des paliers d'étape, le record de la saison posé
 * dessus.
 *
 * La géométrie (départ, record, parcours) vient de `resultThread`, partagée
 * avec le suivi de l'en-tête.
 */
export function ResultThread({
  link,
  paliers,
  dotClassName,
  ringClassName,
  inkClassName,
  textClassName,
}: {
  link: ProjectMetric
  paliers: Palier[]
  /** `domainColor(...).dot` — le trait parcouru. */
  dotClassName: string
  /** `domainColor(...).ring` — le contour du rond du record. */
  ringClassName: string
  /** `domainColor(...).ink` — paliers franchis. */
  inkClassName: string
  /** `domainColor(...).text` — le drapeau d'une cible atteinte. */
  textClassName: string
}) {
  const { metric, target } = link
  const unit = metric.unit
  const { dep, rec, reached, recul, better, p, filled } = resultThread(link)
  const xs = paliers.map((pal, i) =>
    dep === null ? ((i + 1) / (paliers.length + 1)) * 100 : p(pal.value),
  )
  const vs = [0, ...xs, 100]
  const gap = (i: number) => Math.min(vs[i + 1] - vs[i], vs[i + 2] - vs[i + 1])
  const showRecord =
    rec !== null && !reached && !xs.some((x) => Math.abs(x - p(rec)) < 4)

  return (
    <div className="relative mx-3 mt-auto h-[34px]">
      <div className="absolute inset-x-0 top-[9px] h-px bg-zinc-300 dark:bg-zinc-600" />
      <div
        className={cn('absolute left-0 top-2 h-[3px] rounded-sm', dotClassName)}
        style={{ width: `${filled}%` }}
      />

      {/* Le départ se dessine toujours ; sans relevé, il reste sans valeur. */}
      <Point
        x={0}
        label={dep !== null ? formatValue(dep, unit) : undefined}
        labelClassName="mt-[5px]"
      >
        <span className="mt-[5px] size-[9px] rounded-full bg-zinc-300 dark:bg-zinc-600" />
      </Point>

      {paliers.map((pal, i) => {
        if (gap(i) < 5) return null
        const crossed = rec !== null && better(rec, pal.value)
        return (
          <Point
            key={`${pal.n}-${pal.value}`}
            x={xs[i]}
            narrow
            label={gap(i) >= 14 ? formatValue(pal.value, unit) : undefined}
            labelClassName={crossed ? textClassName : undefined}
            title={`Étape ${pal.n} · ${pal.title} — ${formatValue(pal.value, unit)}`}
          >
            <span
              className={cn(
                'grid size-[18px] place-items-center rounded-full text-[9px] font-bold',
                crossed
                  ? cn('text-white', inkClassName)
                  : 'border border-zinc-300 bg-card text-muted-foreground dark:border-zinc-600',
              )}
            >
              {pal.n}
            </span>
          </Point>
        )
      })}

      {showRecord && rec !== null && (
        <span
          className={cn(
            // Le bord est dans les 9 px : un anneau intérieur, pas autour.
            'absolute top-[5px] z-[3] size-[9px] -translate-x-1/2 rounded-full bg-card ring-2 ring-inset',
            recul ? 'ring-[#c2410c]' : ringClassName,
          )}
          style={{ left: `${p(rec)}%` }}
        />
      )}

      <Point
        x={100}
        label={formatValue(target, unit)}
        labelClassName={
          reached ? textClassName : 'text-zinc-600 dark:text-zinc-300'
        }
      >
        <span className="grid size-[18px] place-items-center bg-card">
          <TargetFlag
            className={cn(
              'size-4',
              reached ? textClassName : 'text-zinc-600 dark:text-zinc-300',
            )}
            filled={reached}
          />
        </span>
      </Point>
    </div>
  )
}

/**
 * Le drapeau de la cible : un fanion à encoche, plein quand la cible est
 * atteinte. Dessiné ici et non pris à lucide, dont le drapeau flotte.
 */
export function TargetFlag({
  className,
  filled,
}: {
  className?: string
  filled?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5 22V4" />
      <path d="M5 4h12l-2.5 4L17 12H5" />
    </svg>
  )
}

/**
 * Un repère du fil, centré sur sa position, sa valeur 3 px en dessous. Un
 * palier (`narrow`) tient dans 24 px ; le départ et le drapeau dans 44.
 */
function Point({
  x,
  narrow,
  label,
  labelClassName,
  title,
  children,
}: {
  x: number
  narrow?: boolean
  label?: string
  labelClassName?: string
  title?: string
  children: React.ReactNode
}) {
  const point = (
    <span
      className={cn(
        'absolute top-0 flex -translate-x-1/2 flex-col items-center',
        narrow ? 'w-6' : 'w-11',
      )}
      style={{ left: `${x}%` }}
    >
      {children}
      {label && (
        <span
          className={cn(
            'mt-[3px] text-[10px] leading-none font-semibold whitespace-nowrap tabular-nums text-muted-foreground',
            labelClassName,
          )}
        >
          {label}
        </span>
      )}
    </span>
  )
  if (!title) return point
  // Un palier trop serré perd sa valeur sous le rond : l'infobulle la rend.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{point}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
