import { cn } from '@/shared/lib/utils'

import { domainColor, domainColorValues } from '../model/color'
import type { Domain } from '../model/types'

/**
 * Les domaines d'un projet, en lecture (#203, en-tête de `prod/Objectif`) :
 * une étiquette par domaine, le principal en teinte pleine. Rien pour un
 * seul domaine — la tuile le dit déjà.
 */
export function DomainBadges({
  domains,
  className,
}: {
  domains: Domain[]
  className?: string
}) {
  if (domains.length < 2) return null
  return (
    <span
      className={cn('inline-flex flex-wrap items-center gap-1.5', className)}
    >
      {domains.map((d, i) => {
        const c = domainColorValues(d.color)
        return (
          <span
            key={d.id}
            title={i === 0 ? 'Domaine principal' : undefined}
            className={cn(
              'inline-flex h-[22px] items-center gap-1 rounded-md border px-[7px] text-xs leading-none font-medium',
              domainColor(d.color).text,
            )}
            style={{
              background: `color-mix(in oklab, ${c.base} ${i === 0 ? 35 : 12}%, transparent)`,
              borderColor: `color-mix(in oklab, ${c.base} ${i === 0 ? 70 : 40}%, transparent)`,
            }}
          >
            {d.emoji} {d.name}
          </span>
        )
      })}
    </span>
  )
}
