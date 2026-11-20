import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

import { type PaceScope, paceRows } from '../model/pace-card'
import { PACING_META, type Pacing } from '../model/progress'
import type { Project } from '../model/types'
import { PaceCard } from './pace-card'
import { HoverCard, StateDot } from './state-dot'

/**
 * La pastille d'un **rythme** (d'une étape, d'un Total) et, au survol, sa
 * carte de rythme (#112) — le projet a la sienne dans `ProjectStateChip`.
 */
export function PaceDot({
  project,
  scope,
  pace,
  today,
  ink,
  dotClassName,
  className,
}: {
  project: Project
  scope: PaceScope
  pace: Pacing
  today: string
  /** L'encre du domaine (une couleur CSS). */
  ink: string
  /** Pour changer la taille du point (8 px par défaut). */
  dotClassName?: string
  className?: string
}) {
  const meta = PACING_META[pace]
  const rows = paceRows(project, scope, today)
  return (
    <StateDot
      label={meta.label}
      dotClassName={cn(meta.dot, dotClassName)}
      className={className}
      card={
        rows.length > 0 ? (
          <PaceCard pace={pace} rows={rows} ink={ink} />
        ) : undefined
      }
    />
  )
}

/**
 * Au survol d'une ligne de Total (la préparation, 30/10) : la carte de rythme
 * de ce seul Total — sa tranche d'étape (`scope` d'étape) ou le Total du
 * projet. Sans période complète, pas de carte : la ligne seule.
 */
export function TotalPaceHover({
  project,
  scope,
  totalId,
  today,
  ink,
  className,
  children,
}: {
  project: Project
  scope: PaceScope
  totalId: string
  today: string
  ink: string
  className?: string
  children: ReactNode
}) {
  const rows = paceRows(project, scope, today).filter((r) => r.key === totalId)
  if (rows.length === 0) return <>{children}</>
  return (
    <HoverCard
      className={className}
      card={<PaceCard pace={rows[0].pace} rows={rows} ink={ink} />}
    >
      {children}
    </HoverCard>
  )
}
