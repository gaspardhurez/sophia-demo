import { Check } from 'lucide-react'
import { useState } from 'react'

import { formatDateShort } from '@/shared/lib/format'
import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import type { PaceRow, PaceTab } from '../model/pace-card'
import { type Pacing, PACING_META } from '../model/progress'
import { UnitMarkGlyph } from './unit-mark'

/** Une décimale, la virgule : « 0,9 », « 16 ». */
const fr = (n: number) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

/** « −34 % », « +12 % » (signe moins typographique). */
function gapLabel(gap: number): string {
  const pct = Math.round(gap * 100)
  if (pct === 0) return '0 %'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`
}

/** « 16 heures », accordé au nombre. */
const qty = (n: number, row: PaceRow) =>
  `${fr(n)} ${unitLabel(row.unit, Math.round(n * 10) / 10)}`.trimEnd()

/** Le libellé et le point d'un rythme ; sans rythme à tenir (aucun, ou
 *  tous les Totaux remplis), « En cours » — comme la chip de projet. */
function look(pace: Pacing | null) {
  return pace && pace !== 'done'
    ? PACING_META[pace]
    : { label: 'En cours', dot: 'bg-emerald-500' }
}

/**
 * La **carte de rythme** (#112, `kit/Carte rythme`) : au survol d'une
 * pastille de rythme, à la place de son infobulle. En tête, le rythme (sans
 * écart global : chaque objectif porte le sien juste dessous) ; puis une
 * ligne par objectif, du pire au meilleur — où il en est et ce qui est attendu
 * à date, une barre (le fait en plein, la projection à l'échéance en
 * pointillé), le rythme actuel et celui à tenir.
 *
 * Avec des **onglets** (#114, carte de projet) : deux intercalaires
 * accrochés au bord haut — l'étape en cours, puis le projet entier —,
 * chacun avec le point de son rythme ; la carte suit l'onglet actif. Rien
 * n'est retenu : elle s'ouvre toujours sur le premier.
 */
export function PaceCard({
  pace,
  rows,
  tabs,
  ink,
}: {
  pace: Pacing | null
  rows: PaceRow[]
  /** À la place de `pace` et `rows`, un onglet par lecture. */
  tabs?: PaceTab[] | null
  /** L'encre du domaine (une couleur CSS). */
  ink: string
}) {
  const [active, setActive] = useState(0)
  const tab = tabs?.[Math.min(active, tabs.length - 1)]
  const shown = tab ? { pace: tab.pace, rows: tab.rows } : { pace, rows }
  return (
    <div className="flex w-[460px] flex-col text-foreground">
      {tabs && tabs.length > 0 && (
        <div
          role="tablist"
          className="relative z-10 -mb-px flex gap-0.5 pl-2.5"
        >
          {tabs.map((t, i) => (
            <Tooltip key={t.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={t === tab}
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex h-7 max-w-[200px] items-center gap-1.5 rounded-t-lg border border-b-0 px-3 text-xs font-medium',
                    t === tab
                      ? 'bg-card text-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      look(t.pace).dot,
                    )}
                  />
                  <span className="min-w-0 truncate">{t.name}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {t.name} · {look(t.pace).label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
      <PaceCardBody {...shown} ink={ink} />
    </div>
  )
}

function PaceCardBody({
  pace,
  rows,
  ink,
}: {
  pace: Pacing | null
  rows: PaceRow[]
  ink: string
}) {
  const { label, dot } = look(pace)
  return (
    <div className="flex flex-col gap-4 rounded-[10px] border bg-card p-3 shadow-[0_6px_20px_oklch(0.21_0.008_285/0.08)]">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span className={cn('size-2 rounded-full', dot)} />
        <span>{label}</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                row.pace ? PACING_META[row.pace].dot : 'bg-muted-foreground/40',
              )}
            />
            <UnitMarkGlyph mark={row.mark} className="shrink-0" />
            <span className="min-w-0 truncate font-medium">{row.name}</span>
            <span className="shrink-0 text-xs whitespace-nowrap tabular-nums">
              {fr(row.value)} / {qty(row.target, row)}
            </span>
            {!row.reached && (
              <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                · {qty(row.expected, row)} à date
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs font-medium whitespace-nowrap tabular-nums">
              {row.reached ? (
                <Check
                  aria-label="Cible atteinte"
                  className="size-3.5"
                  strokeWidth={2.5}
                />
              ) : (
                gapLabel(row.gap)
              )}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-muted">
            {row.projected !== null && !row.reached && (
              <div
                className="absolute inset-y-0 left-0 rounded-full border border-dashed opacity-55"
                style={{
                  borderColor: ink,
                  width: `${Math.min(100, (row.projected / (row.target || 1)) * 100)}%`,
                }}
              />
            )}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: ink,
                width: `${Math.min(100, (row.value / (row.target || 1)) * 100)}%`,
              }}
            />
          </div>
          {!row.reached && (
            <div className="flex flex-col gap-0.5 text-xs tabular-nums">
              <span className="truncate">
                Rythme actuel :{' '}
                {row.weekly === null || row.projected === null
                  ? '—'
                  : `${qty(row.weekly, row)} par semaine, soit ${qty(row.projected, row)} au ${formatDateShort(row.due)}`}
              </span>
              {row.needed !== null && (
                <span className="truncate text-muted-foreground">
                  Rythme attendu : {qty(row.needed, row)} par semaine pour
                  atteindre la cible
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
