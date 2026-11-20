import { PHASES, type PhaseKey } from './phases'
import type { RampItem } from './ramp'
import { recallLaunched } from './study'
import type { AcquisitionPlan } from './types'

/** Les objets d'un cycle : sa rampe, jointe à la bibliothèque (`rampOf`). */
type Item = RampItem

function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Où en est une phase — quatre états, dont un qui dit « pas dans ce cycle ». */
export type PhaseState = 'off' | 'todo' | 'doing' | 'done'

export interface PhaseProgress {
  key: PhaseKey
  label: string
  short: string
  hint: string
  state: PhaseState
  /** Objets maîtrisés / attendus. Nuls sur l'étude et la rétention. */
  done: number
  total: number
  /** 0 → 1, ce que la pastille dessine en secteur. */
  ratio: number
  /** La ligne de méta sous le nom de la phase. */
  meta: string
  /** Ce qui est échu dans la phase — l'interro du cycle, sur l'Étude. */
  due: number
}

/** Les objets d'une phase de pratique (même règle que le back,
 * `AcquisitionPlan._active_items`). */
export function phaseItems(items: Item[], key: PhaseKey): Item[] {
  const phase = PHASES.find((p) => p.key === key)
  if (!phase?.nature) return []
  return items.filter((i) => i.nature === phase.nature)
}

/** L'interro du cycle est due : sa date de rappel est passée ou aujourd'hui. */
export function recallDue(plan: AcquisitionPlan | undefined): boolean {
  const due = plan?.recall_next_due_at
  return due != null && due <= today()
}

function practiceMeta(key: PhaseKey, done: number, total: number): string {
  if (total === 0) return 'Rien encore'
  if (key === 'situation') {
    const noun = total > 1 ? 'mises en situation' : 'mise en situation'
    return done === total ? `${total} ${noun}, tenue` : `${total} ${noun}`
  }
  return `${done} sur ${total}`
}

/** L'état de chaque phase, dans l'ordre canonique. */
export function phasesProgress(
  plan: AcquisitionPlan | undefined,
  items: Item[],
): PhaseProgress[] {
  return PHASES.map(({ key, label, short, hint }) => {
    const inCycle = Boolean(plan && plan[key])

    if (key === 'study') {
      const done = plan?.study_mastered ?? false
      const started =
        (plan?.study_sessions ?? 0) > 0 || (plan ? recallLaunched(plan) : false)
      return {
        key,
        label,
        short,
        hint,
        // Une étude faite dans le cycle la passe « en cours » (#107, point 11),
        // une interro lancée aussi ; maîtrisée (#157), elle est validée.
        state: !inCycle ? 'off' : done ? 'done' : started ? 'doing' : 'todo',
        done: 0,
        total: 0,
        ratio: done ? 1 : 0,
        meta: done ? 'Validée' : started ? 'En cours' : 'À faire',
        // L'interro vit sur l'Étude (#81) : « · 1 dû » s'y lit.
        due: recallDue(plan) ? 1 : 0,
      }
    }

    if (key === 'retention') {
      // La rétention vient **après** l'acquis : elle n'a d'état qu'une fois le
      // cycle clos acquis ; avant, elle se lit en pointillé.
      const kept = items.filter((i) => i.in_retention).length
      const acquired = plan?.state === 'completed'
      return {
        key,
        label,
        short,
        hint,
        state: !inCycle || !acquired ? 'off' : 'done',
        done: 0,
        total: kept,
        ratio: 0,
        meta: acquired
          ? 'Gardés'
          : kept > 0
            ? `${kept} gardé${kept > 1 ? 's' : ''}`
            : 'Rien encore',
        due: 0,
      }
    }

    const phase = phaseItems(items, key)
    const done = phase.filter((i) => i.mastered).length
    const total = phase.length
    // « En cours » se lit sur les passes autant que sur les verdicts : un
    // exercice travaillé trois fois sans être validé n'est pas « pas commencé ».
    // La pièce générique faite (« Pratique », « Application », #107) aussi.
    const generic =
      key === 'isolated' ? plan?.isolated_sessions : plan?.situation_sessions
    const started =
      done > 0 || phase.some((i) => i.sessions > 0) || (generic ?? 0) > 0
    const state: PhaseState = !inCycle
      ? 'off'
      : total > 0 && done === total
        ? 'done'
        : started
          ? 'doing'
          : 'todo'

    return {
      key,
      label,
      short,
      hint,
      state,
      done,
      total,
      ratio: total === 0 ? 0 : done / total,
      meta: practiceMeta(key, done, total),
      due: 0,
    }
  })
}

/**
 * La progression du cycle : ce que la jauge et le compteur affichent.
 *
 * L'étude compte pour un objet — elle est une condition du cycle au même titre
 * qu'un exercice, et l'omettre ferait mentir la jauge d'un cycle qui n'active
 * que la théorie.
 */
export function cycleProgress(
  plan: AcquisitionPlan | undefined,
  items: Item[],
): { done: number; total: number } {
  if (!plan) return { done: 0, total: 0 }
  let done = plan.study && plan.study_mastered ? 1 : 0
  let total = plan.study ? 1 : 0
  for (const { key, nature } of PHASES) {
    if (!nature || !plan[key]) continue
    const phase = phaseItems(items, key)
    total += phase.length
    done += phase.filter((i) => i.mastered).length
  }
  return { done, total }
}

/**
 * La même règle que `cycleProgress`, lue sur les compteurs du serveur — quand
 * on n'a pas la bibliothèque sous la main.
 * `done_items` / `total_items` ne comptent que les objets : l'étude activée
 * s'y ajoute pour un, comme sur la jauge du cycle en cours.
 */
export function planCount(plan: AcquisitionPlan): {
  done: number
  total: number
} {
  const study = plan.study ? 1 : 0
  return {
    done: plan.done_items + (plan.study && plan.study_mastered ? 1 : 0),
    total: plan.total_items + study,
  }
}
