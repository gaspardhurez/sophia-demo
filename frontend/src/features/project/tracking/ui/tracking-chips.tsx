import { Check } from 'lucide-react'

import type { CSSProperties, ReactNode, Ref } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import { UnitMarkGlyph } from '@/entities/project'
import { cn } from '@/shared/lib/utils'

import { isTracked, LEARNING_EMOJI, type TrackingChip } from '../model/tracking'

/**
 * Les chips du suivi (kit/Suivi). Une chip suivie écrit sa cible, se remplit
 * à hauteur de l'avancement et se choisit au clic ; la chip choisie est bordée
 * à l'encre (design #36) et écrit « valeur / cible », et au survol la valeur
 * glisse devant la cible. Un Résultat se remplit jusqu'au record sur son fil,
 * sans valeur écrite.
 *
 * En **lecture seule** (`readOnly`, la carte de projet, #210) : rien ne se
 * choisit ni ne réagit au survol, « valeur / cible » est toujours écrit, un
 * Résultat montre son record en gris clair ; un gabarit un cran plus petit
 * (22 px). La rangée prend alors `rowRef`, `className` et `style` : c'est la
 * carte qui la mesure et la plie.
 */
export function TrackingChips({
  chips,
  selected,
  onSelect,
  color,
  ink,
  before,
  readOnly = false,
  rowRef,
  className,
  style,
}: {
  chips: TrackingChip[]
  selected?: string | null
  onSelect?: (id: string) => void
  color: DomainColorClasses
  /** `domainColorValues(...).ink` — le bord de la chip choisie. */
  ink: string
  /** Avant les objectifs, sur la même ligne : les compteurs du projet (#194). */
  before?: ReactNode
  readOnly?: boolean
  rowRef?: Ref<HTMLDivElement>
  className?: string
  style?: CSSProperties
}) {
  if (chips.length === 0 && !before) return null
  return (
    <div
      ref={rowRef}
      style={style}
      className={cn(
        'flex flex-wrap items-center',
        readOnly ? 'gap-1.5' : 'min-h-6 gap-2',
        className,
      )}
    >
      {before}
      {chips.map((c) => {
        const tracked = isTracked(c)
        const on = !readOnly && tracked && c.id === selected
        const body = (
          <>
            {tracked && (
              <span
                aria-hidden
                className={cn(
                  'absolute inset-y-0 left-0 transition-opacity',
                  color.dot,
                  on ? 'opacity-40' : 'opacity-[.18]',
                )}
                style={{ width: `${c.pct}%` }}
              />
            )}
            <ChipBody chip={c} on={on || readOnly} readOnly={readOnly} />
          </>
        )
        const base = cn(
          'group/chip relative inline-flex shrink-0 items-center overflow-hidden rounded-md border bg-muted/60 leading-none font-medium whitespace-nowrap tabular-nums',
          readOnly
            ? 'h-[22px] gap-[5px] px-[7px] text-[11.5px]'
            : 'h-6 gap-1.5 px-2 text-xs',
          color.edge,
          color.text,
        )
        // Les Réalisations se lisent : pas de bouton, pas de survol.
        return tracked && !readOnly ? (
          <button
            key={`${c.kind}:${c.id}`}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect?.(c.id)}
            title={TITLES[c.kind]}
            style={{ '--chip-ink': ink } as CSSProperties}
            className={cn(
              base,
              'cursor-pointer transition-[box-shadow,transform,background,border-color] duration-150',
              // La choisie : bord 1 px à l'encre, doublé d'un liseré de 0,5 px.
              on &&
                'border-[color:var(--chip-ink)] shadow-[inset_0_0_0_0.5px_var(--chip-ink)]',
              'hover:-translate-y-px hover:bg-card hover:shadow-[0_3px_8px_-2px_oklch(0.21_0.008_285/0.25)]',
            )}
          >
            {body}
          </button>
        ) : (
          <span
            key={`${c.kind}:${c.id}`}
            title={TITLES[c.kind]}
            className={base}
          >
            {body}
          </span>
        )
      })}
    </div>
  )
}

const TITLES: Record<TrackingChip['kind'], string> = {
  total: 'Total',
  learning: 'Apprentissage',
  result: 'Résultat',
  achievement: 'Réalisation',
}

function ChipBody({
  chip,
  on,
  readOnly,
}: {
  chip: TrackingChip
  on: boolean
  readOnly: boolean
}) {
  switch (chip.kind) {
    case 'total':
    case 'learning':
      return (
        <>
          {chip.kind === 'total' ? (
            <UnitMarkGlyph
              mark={chip.mark}
              className="relative text-[13px] text-current"
            />
          ) : (
            <span aria-hidden className="relative">
              {LEARNING_EMOJI}
            </span>
          )}
          <span className="relative inline-flex items-center whitespace-pre">
            {/* La valeur se glisse devant la cible : largeur animée. */}
            <span
              className={cn(
                'inline-block overflow-hidden whitespace-pre transition-[max-width,opacity] duration-200 ease-out',
                on
                  ? 'max-w-16 opacity-100'
                  : 'max-w-0 opacity-0 group-hover/chip:max-w-16 group-hover/chip:opacity-100',
              )}
            >
              {chip.value} /{' '}
            </span>
            {chip.target}
          </span>
        </>
      )
    case 'result':
      // Le record ne s'écrit plus en suffixe : il se lit sur le remplissage,
      // et dans la bulle du fil quand la chip est choisie (design #36).
      return (
        <>
          {chip.emoji && <span className="relative">{chip.emoji}</span>}
          <span className="relative">{chip.sentence}</span>
          {/* En lecture seule, la carte n'a pas de fil : le record s'écrit. */}
          {readOnly && chip.record && (
            <span className="relative font-normal opacity-70">
              {chip.record}
            </span>
          )}
        </>
      )
    case 'achievement':
      return (
        <>
          {chip.done && (
            <Check className="relative size-3 shrink-0" strokeWidth={3} />
          )}
          {chip.emoji && <span className="relative">{chip.emoji}</span>}
          <span className="relative">{chip.title}</span>
        </>
      )
  }
}
