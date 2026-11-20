import type { Project } from './types'

/** L'aide sous « Période », à l'édition comme à la création (#196). */
export const PERIOD_HINT =
  'Une date de fin est adaptée aux objectifs clairement bornés et qui ont une réelle pression calendaire. Pour apprendre sans pression, mieux vaut viser large ou ne pas en mettre du tout.'

/**
 * La plage d'une étape une fois la période du projet posée — **la règle du
 * back, à l'identique** (`sophia.domain.period.clip_step`) : raccourcie jusqu'à
 * la borne, ou sans dates si la période la recouvre. Une étape sans ses deux
 * dates n'est pas touchée.
 */
export function clipStep(
  start: string | null,
  due: string | null,
  periodStart: string | null,
  periodDue: string | null,
): [string | null, string | null] {
  if (!start || !due) return [start, due]
  let s = start
  let d = due
  if (periodStart && s < periodStart) {
    if (d < periodStart) return [null, null]
    s = periodStart
  }
  if (periodDue && d > periodDue) {
    if (s > periodDue) return [null, null]
    d = periodDue
  }
  return [s, d]
}

/** Ce que deviendraient les étapes si le projet prenait cette période. */
export function periodEffects(
  project: Project,
  start: string | null,
  due: string | null,
  fmt: (iso: string) => string,
): { title: string; before: string; after: string }[] {
  return [...project.steps]
    .sort((a, b) => a.order - b.order)
    .flatMap((step) => {
      if (!step.start_at || !step.due_at) return []
      const [s, d] = clipStep(step.start_at, step.due_at, start, due)
      if (s === step.start_at && d === step.due_at) return []
      return [
        {
          title: step.title,
          before: `${fmt(step.start_at)} – ${fmt(step.due_at)}`,
          after: s && d ? `${fmt(s)} – ${fmt(d)}` : 'Sans dates',
        },
      ]
    })
}

const shift = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + days)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * Ce que la pose d'une plage sur une étape ferait autour d'elle — **la règle
 * du back, à l'identique** (`sophia.domain.period.place_step`) : la voisine
 * d'avant finit la veille, celle d'après commence le lendemain, recouverte
 * elle perd ses dates ; hors période, la borne du projet se décale.
 */
export function placeEffects(
  project: Project,
  stepId: string,
  start: string,
  due: string,
  fmt: (iso: string) => string,
): { title: string; before: string; after: string }[] {
  const me = project.steps.find((s) => s.id === stepId)
  if (!me) return []
  const out: { title: string; before: string; after: string }[] = []
  for (const n of [...project.steps].sort((a, b) => a.order - b.order)) {
    if (n.id === stepId || !n.start_at || !n.due_at) continue
    if (start > n.due_at || due < n.start_at) continue
    const before = `${fmt(n.start_at)} – ${fmt(n.due_at)}`
    if (n.order < me.order) {
      const end = shift(start, -1)
      out.push({
        title: n.title,
        before,
        after:
          end < n.start_at ? 'Sans dates' : `${fmt(n.start_at)} – ${fmt(end)}`,
      })
    } else {
      const begin = shift(due, 1)
      out.push({
        title: n.title,
        before,
        after:
          begin > n.due_at ? 'Sans dates' : `${fmt(begin)} – ${fmt(n.due_at)}`,
      })
    }
  }
  if (project.start_at && start < project.start_at)
    out.push({
      title: 'Début du projet',
      before: fmt(project.start_at),
      after: fmt(start),
    })
  if (project.due_at && due > project.due_at)
    out.push({
      title: 'Fin du projet',
      before: fmt(project.due_at),
      after: fmt(due),
    })
  return out
}

/**
 * Les dates suggérées d'une étape : le lendemain de la précédente (le début
 * du projet pour la première), la veille de la suivante (la fin du
 * projet pour la dernière).
 */
export function suggestedDates(
  project: Project,
  stepId: string,
): { start: string | null; end: string | null } {
  const steps = [...project.steps].sort((a, b) => a.order - b.order)
  const i = steps.findIndex((s) => s.id === stepId)
  const prev = steps
    .slice(0, i)
    .reverse()
    .find((s) => s.due_at)
  const next = steps.slice(i + 1).find((s) => s.start_at)
  return {
    start: prev?.due_at ? shift(prev.due_at, 1) : project.start_at,
    end: next?.start_at ? shift(next.start_at, -1) : project.due_at,
  }
}
