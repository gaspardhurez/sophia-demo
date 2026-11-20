import type { ActivityActSet, ActKind } from '@/entities/activity'

/**
 * Un acte tel que le panneau le tient : celui de l'activité (avec son `id`,
 * et le titre et l'emoji de son objet pour un exercice), ou en attente sur un
 * brouillon, qui part juste après sa création.
 */
export type ActDraft = ActivityActSet & {
  id?: string
  item_title?: string | null
  item_emoji?: string | null
  /** Une interro passée : le jour de sa passation. */
  passed_on?: string | null
  /** Le retour d'une passe (#139) : niveau 1–5 et note. */
  level?: number | null
  feedback?: string | null
}

/** Dans un groupe, l'étude d'abord, puis l'interro, puis les exercices. */
export const KIND_ORDER: Record<ActKind, number> = {
  study: 0,
  recall: 1,
  practice: 2,
}

/** Le même acte : même savoir, même geste, même objet ou même phase
 *  générique. */
export function sameAct(a: ActivityActSet, b: ActivityActSet): boolean {
  return (
    a.skill_id === b.skill_id &&
    a.kind === b.kind &&
    (a.practice_item_id ?? null) === (b.practice_item_id ?? null) &&
    (a.nature ?? null) === (b.nature ?? null)
  )
}

/**
 * Ce qui part à la création d'un acte : ses seuls champs (le serveur refuse
 * tout autre, `extra="forbid"`) — pas le retour d'une passe donné en
 * brouillon, qui s'écrit ensuite, ni ce que l'écran en lit.
 */
export function actSet(a: ActDraft): ActivityActSet {
  return {
    skill_id: a.skill_id,
    kind: a.kind,
    plan_id: a.plan_id ?? null,
    practice_item_id: a.practice_item_id ?? null,
    nature: a.nature ?? null,
  }
}
