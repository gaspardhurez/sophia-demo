import { type Activity, actLines } from '@/entities/activity'
import { type Project, sequenceRank } from '@/entities/project'
import type { PreparationProject } from '@/entities/preparation'
import type { LinkedItem } from '@/widgets/activity-calendar'

import { metricValue } from './format'

/** Une cible de Résultat posée sur une séance, telle que la séance la montre. */
export interface SessionTarget {
  id: string
  emoji: string
  label: string
}

/**
 * Les cibles posées sur les séances de la semaine prochaine, par séance, pour
 * tous les projets lus. Un relevé d'une séance pas encore faite est une
 * **cible** (`counts` faux) : elle se dit « Classement → 1 500 », jamais comme
 * un résultat atteint.
 */
export function targetsBySession(
  preparations: PreparationProject[],
): Map<string, SessionTarget[]> {
  const out = new Map<string, SessionTarget[]>()
  const seen = new Set<string>()
  for (const p of preparations)
    for (const r of p.next.results)
      for (const t of r.targets) {
        if (!t.activity_id || t.counts || seen.has(t.id)) continue
        seen.add(t.id)
        const list = out.get(t.activity_id) ?? []
        list.push({
          id: t.id,
          emoji: r.emoji || '🎯',
          label: `${r.name} → ${metricValue(t.value, r.unit)}`,
        })
        out.set(t.activity_id, list)
      }
  return out
}

/**
 * Ce qui est lié à une séance, pour le calendrier de la préparation (#92,
 * point 7) : ses actes d'apprentissage — une ligne par savoir (#108) —, les
 * réalisations qu'elle prépare, les cibles qu'on y a posées.
 */
export function linkedOf(
  a: Activity,
  targets: Map<string, SessionTarget[]>,
  domainEmoji: string,
  projects?: Project[],
): LinkedItem[] {
  return [
    ...actLines(
      a.acts,
      domainEmoji,
      sequenceRank(
        projects,
        a.projects.map((o) => o.project_id),
      ),
    ),
    ...a.achievements.map((x) => ({
      key: `achievement-${x.id}`,
      emoji: x.emoji || '🏆',
      label: x.title,
    })),
    ...(targets.get(a.id) ?? []).map((t) => ({
      key: `target-${t.id}`,
      emoji: t.emoji,
      label: t.label,
    })),
  ]
}
