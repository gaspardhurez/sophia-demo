import { PLANNING_LABELS } from '../lib/link'
import type { ActivityTypeLink } from '../model/types'
import { type LinkColors, PlanningCard } from './planning-card'

/**
 * Une activité type planifiée pour un projet, en carte basse (#38,
 * `kit/Activites types`) : la tuile, le titre, la planification, et les sept
 * jours où elle pose. Le créneau n'y figure pas.
 */
export function LinkCard({
  link,
  colors,
  onSelect,
  open,
}: {
  link: ActivityTypeLink
  colors: LinkColors
  /** Rend la carte cliquable — l'édition ouvre le popover du lien. */
  onSelect?: (rect: DOMRect) => void
  /** Le popover est ouvert sur ce lien : le bord se fonce. */
  open?: boolean
}) {
  return (
    <PlanningCard
      id={link.activity_type_id}
      emoji={link.emoji}
      title={link.title}
      label={PLANNING_LABELS[link.planning]}
      planning={link.planning}
      weekdays={link.weekdays}
      colors={colors}
      onSelect={onSelect}
      open={open}
    />
  )
}
