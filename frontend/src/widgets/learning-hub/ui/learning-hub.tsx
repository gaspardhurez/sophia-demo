import { useMemo } from 'react'

import { useDomains } from '@/entities/domain'
import { urgentCount, useLearningOverview } from '@/entities/learning'
import { skillPaths, useAllSkills } from '@/entities/skill'
import { Skeleton, SkeletonRegion } from '@/shared/ui'

import type { PieceOpen } from '../model/rows'
import { HubSidebar } from './hub-sidebar'
import { Overview } from './overview'

/**
 * La colonne du hub de l'apprentissage (#152, `prod/Apprentissage`) : la
 * recherche, « Vue d'ensemble », les savoirs en cours et les prochains. Elle reste en place
 * pendant qu'on parcourt les savoirs — la page la pose à gauche de la vue
 * (vue d'ensemble ou page savoir), et c'est elle qui dit où l'on va.
 */
export function LearningSidebar({
  selected,
  onSelect,
}: {
  /** Le savoir ouvert à droite ; `null` : la vue d'ensemble. */
  selected: string | null
  onSelect: (skillId: string | null) => void
}) {
  const { data: overview } = useLearningOverview()
  const { data: skills } = useAllSkills()
  const { data: domains } = useDomains()
  const paths = useMemo(() => skillPaths(skills ?? []), [skills])

  return (
    <HubSidebar
      current={overview?.skills ?? []}
      upcoming={
        overview?.groups
          .find((g) => g.group === 'start')
          ?.items.map((i) => i.skill_id) ?? []
      }
      skills={skills ?? []}
      paths={paths}
      domains={domains ?? []}
      urgent={urgentCount(overview)}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

const today = () =>
  new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

/**
 * La vue d'ensemble (#152, #155) : ce qui est à faire, tous savoirs
 * confondus — les séances du jour et des 7 suivants, puis les cartes « À
 * faire », chaque ligne avec son geste.
 */
export function LearningOverview({
  onSkill,
  onPiece,
}: {
  /** Le nom d'un savoir : il s'ouvre à droite. */
  onSkill: (skillId: string) => void
  /** Une étiquette de pièce : la page ouvre sa fiche (27/10). */
  onPiece?: (piece: PieceOpen) => void
}) {
  const { data: overview } = useLearningOverview()
  const { data: skills } = useAllSkills()
  const { data: domains } = useDomains()
  const byId = useMemo(
    () => new Map((skills ?? []).map((s) => [s.id, s])),
    [skills],
  )

  return (
    <div className="flex min-w-0 flex-col gap-6 px-9 pt-7 pb-12 max-md:px-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-heading text-[26px] font-semibold tracking-[-0.015em] whitespace-nowrap">
          Le hub
        </h1>
        <span className="text-sm text-muted-foreground">{today()}</span>
      </div>
      {overview && skills ? (
        <Overview
          overview={overview}
          skills={byId}
          domains={domains ?? []}
          onSkill={onSkill}
          onPiece={onPiece}
        />
      ) : (
        <SkeletonRegion>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </SkeletonRegion>
      )}
    </div>
  )
}
