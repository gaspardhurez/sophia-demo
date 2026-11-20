import { linksOf } from './links'
import type { Activity, ActivityCreate } from './types'

/**
 * Ce qu'on recopie d'une activité : son **intention**, jamais son vécu.
 *
 * Le rattachement (domaine, projets et étapes), l'activité type, les actes
 * d'apprentissage, le titre, l'emoji et les valeurs déclarées font le duplicata ;
 * la coche, les notes et les relevés appartiennent à la séance qui a eu lieu.
 * Seule définition du duplicata : le calendrier et la to-do du jour recopient
 * la même chose.
 */
export function copyOf(
  a: Activity,
  slot: { all_day: boolean; start_at: string | null; end_at: string | null },
): ActivityCreate {
  return {
    domain_id: a.domain_id,
    projects: linksOf(a),
    // Le duplicata garde son activité type : deux séances le même jour sont
    // deux séances du même type, pas une séance et une activité orpheline.
    activity_type_id: a.activity_type_id,
    acts: a.acts.map(
      ({ skill_id, kind, plan_id, practice_item_id, nature }) => ({
        skill_id,
        kind,
        plan_id,
        practice_item_id,
        nature,
      }),
    ),
    title: a.title,
    emoji: a.emoji,
    values: a.values.map(({ unit_id, value }) => ({ unit_id, value })),
    done: false,
    ...slot,
  }
}
