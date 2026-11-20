import type { ActivityTypeLink, ActivityTypeLinkSet } from '../model/types'

/** Le lien tel qu'on le renvoie à l'API, pour n'en changer qu'un champ. */
export function toLinkSet(
  link: ActivityTypeLink,
  patch: Partial<ActivityTypeLinkSet> = {},
): ActivityTypeLinkSet {
  return {
    planning: link.planning,
    weekdays: link.weekdays,
    slot_start: link.slot_start,
    slot_minutes: link.slot_minutes,
    preserve_after: link.preserve_after,
    off_step_ids: link.off_step_ids,
    ...patch,
  }
}
