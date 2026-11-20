import { useState } from 'react'

import { type Domain, domainColorValues } from '@/entities/domain'
import type { Project } from '@/entities/project'
import { inDomain } from '@/entities/project'
import type { AcquisitionPlan, CycleStage } from '@/entities/plan'
import type { Skill } from '@/entities/skill'
import { NewCycleForm, type NewCycleStage } from '@/features/plan/create-cycle'

import { CycleTabs } from './cycle-tabs'

const OPEN_PROJECT = new Set(['todo', 'in_progress'])

/** La marque de l'onglet brouillon, d'après le statut choisi. */
const MARK: Record<NewCycleStage, CycleStage> = {
  planned: 'planned',
  active: 'active',
  finished: 'acquired',
}

/**
 * Créer un cycle (design #66, `prod/Savoir`, état « Nouveau cycle ») :
 * l'onglet brouillon « Nouveau cycle », sélectionné, sans ligne d'actions,
 * puis le formulaire. Le brouillon n'existe que dans la page : quitter
 * l'onglet, Annuler ou recharger le fait disparaître.
 *
 * Statut par défaut : Prévu.
 */
export function NewCycle({
  skill,
  domain,
  plans,
  projects,
  onSelect,
  onCancel,
  onCreated,
}: {
  skill: Skill
  domain: Domain | undefined
  plans: AcquisitionPlan[]
  projects: Project[]
  /** Quitter le brouillon pour un autre onglet. */
  onSelect: (planId: string | null) => void
  onCancel: () => void
  onCreated: (plan: AcquisitionPlan) => void
}) {
  const hasActive = plans.some((p) => p.state === 'active')
  const [stage, setStage] = useState<NewCycleStage>('planned')
  const { base: color, ink } = domainColorValues(domain?.color)
  const candidates = projects.filter(
    (o) => inDomain(o, skill.domain_id) && OPEN_PROJECT.has(o.status),
  )

  return (
    <>
      <CycleTabs
        plans={plans}
        selected="draft"
        draft={MARK[stage]}
        projects={projects}
        color={color}
        onSelect={onSelect}
        onNew={() => undefined}
      />
      <NewCycleForm
        skillId={skill.id}
        stage={stage}
        onStageChange={setStage}
        hasActive={hasActive}
        color={color}
        ink={ink}
        candidates={candidates}
        projects={projects}
        onCancel={onCancel}
        onCreated={onCreated}
      />
    </>
  )
}
