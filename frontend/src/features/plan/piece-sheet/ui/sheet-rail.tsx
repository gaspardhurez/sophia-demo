import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import { CriterionPips } from '@/entities/plan'
import { cn } from '@/shared/lib/utils'

import { shortDay } from '../model/build'
import type { PieceSheetData, PieceSheetState } from '../model/types'

/** Le rang de la phase dans la mini-jauge d'une pièce générique. */
const GAUGE: Record<PieceSheetData['phase'], number> = {
  study: 0,
  isolated: 1,
  situation: 2,
}

/**
 * Le **rail** de la fiche (`kit/Fiche piece`, idéation 8k) : 112 px à
 * l'encre du domaine, l'emoji de la pièce en filigrane. La tuile, la phase,
 * le nombre de fois en grand, le critère d'un objet de Pratique ou de Mise
 * en situation (#157 : ses pastilles, « à 5/5 »), l'état en pastille
 * translucide, puis sous un filet « Dernière » / « Prochaine ». En Modifier, `tile` remplace la tuile
 * (le choix de l'emoji).
 */
export function SheetRail({
  data,
  accent,
  tile,
}: {
  data: PieceSheetData
  accent: DomainColorClasses
  tile?: ReactNode
}) {
  const generic = data.kind === 'generic'
  return (
    <aside
      className={cn(
        'relative flex w-28 shrink-0 flex-col items-center gap-2.5 overflow-hidden px-2.5 py-6 text-white',
        accent.ink,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[18px] -left-3.5 -rotate-8 text-[96px] leading-none opacity-12 select-none"
      >
        {generic ? '🌱' : data.emoji}
      </span>
      {tile ? (
        <span className="relative shrink-0">{tile}</span>
      ) : (
        <span className="relative grid size-[52px] shrink-0 place-items-center rounded-[14px] bg-white text-[26px]">
          {generic ? (
            <span aria-hidden className="flex gap-[2.5px]">
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  className={cn(
                    'h-[21px] w-1 rounded-[1px]',
                    k === GAUGE[data.phase] ? accent.ink : 'bg-zinc-300',
                  )}
                />
              ))}
            </span>
          ) : (
            data.emoji
          )}
        </span>
      )}
      <span className="relative text-[11px] font-semibold tracking-[0.06em] uppercase opacity-85">
        {data.phaseLabel}
      </span>
      <span className="relative mt-1.5 font-heading text-[28px] leading-none font-semibold tabular-nums">
        {data.count}
      </span>
      <span className="relative -mt-1 text-[11.5px] opacity-75">fois</span>
      {data.criterion && (
        /* Le critère (#157) : une pastille par passe à atteindre, « à 5/5 ». */
        <span className="relative mt-1 flex flex-col items-center gap-[5px]">
          <CriterionPips variant="sheet" {...data.criterion} />
          <span className="text-[11.5px] opacity-85">
            à {data.criterion.level}/5
          </span>
        </span>
      )}
      <StatePill state={data.state} />
      <span className="relative mt-1.5 flex flex-col gap-2 self-stretch border-t border-white/18 pt-3 text-center">
        <RailDate
          label="Dernière"
          value={data.last ? shortDay(data.last) : '—'}
        />
        <RailDate
          label="Prochaine"
          value={data.next?.label ?? '—'}
          alert={data.next?.alert}
        />
      </span>
    </aside>
  )
}

/** L'état : point vide, demi-disque, ou coche blanche — puis le mot. */
function StatePill({ state }: { state: PieceSheetState }) {
  return (
    <span className="relative mt-0.5 flex items-center gap-[5px] rounded-full bg-white/12 px-2 py-0.5 text-[11.5px] font-medium">
      {state.tone === 'done' ? (
        <Check aria-hidden className="size-[11px]" strokeWidth={3.2} />
      ) : (
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full border-[1.5px]',
            state.tone === 'progress'
              ? 'border-white bg-[conic-gradient(white_0_50%,transparent_50%_100%)]'
              : 'border-white/30',
          )}
        />
      )}
      {state.label}
    </span>
  )
}

function RailDate({
  label,
  value,
  alert = false,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <span className="flex flex-col gap-px">
      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase opacity-65">
        {label}
      </span>
      <span
        className={cn(
          'text-[12.5px] font-medium whitespace-nowrap',
          alert && 'font-semibold text-rose-300',
        )}
      >
        {value}
      </span>
    </span>
  )
}
