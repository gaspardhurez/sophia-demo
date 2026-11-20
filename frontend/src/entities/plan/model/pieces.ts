import type { components } from '@/shared/api'

import { rampOf } from './ramp'
import type { AcquisitionPlan } from './types'

/** Lus sur le contrat : `entities/activity` et `entities/practice` sont des
 *  slices voisines. */
type ActSet = components['schemas']['ActivityActSet']
type LibraryItem = components['schemas']['PracticeItemRead']
type PracticeNature = components['schemas']['PracticeNature']

/** La phase d'une pièce : l'Étude (étude, interro), la Pratique,
 *  l'Application. */
export type PiecePhase = 'study' | PracticeNature

/**
 * Une **pièce** d'un savoir (#107, #108, `kit/Pieces savoir`) : ce qu'on pose
 * sur une séance — l'étude, l'interro, un objet de la rampe, ou la pièce
 * générique d'une phase (« Pratique », « Application », sans objet). Elle
 * porte l'acte qu'elle pose.
 */
export interface Piece {
  /** Unique dans le savoir : le geste, l'objet ou la phase générique. */
  key: string
  phase: PiecePhase
  /** Vide pour une pièce générique (elle se lit avec sa mini-jauge). */
  emoji: string
  title: string
  generic: boolean
  /** La pièce **titre de sa phase** (#109) : l'Étude, et les pièces
   *  génériques Pratique et Application. Les autres se rangent dessous. */
  head: boolean
  /** Une pièce déjà maîtrisée dans ce cycle (#157) : l'étude par son
   *  interro, un objet par son critère ou le verdict à la main. */
  done: boolean
  /** L'interro : le jour de son prochain rappel. */
  due: Date | null
  /** Un objet de la rampe : son critère de maîtrise (#157) — `reached`
   *  passes au niveau, plafonné, toutes si l'objet est maîtrisé. */
  criterion?: { passes: number; level: number; reached: number }
  act: ActSet
}

/** La clé d'un acte dans son savoir : même clé, même pièce. */
export const pieceKey = (
  a: Pick<ActSet, 'kind' | 'practice_item_id' | 'nature'>,
) => `${a.kind}:${a.practice_item_id ?? ''}:${a.nature ?? ''}`

const at = (iso: string) => new Date(`${iso}T00:00:00`)

/**
 * Les pièces d'un savoir, celles **de son cycle** (en cours, sinon prévu —
 * jamais un objet de la bibliothèque hors rampe, #107 point 14), par phase :
 * l'interro si sa courbe est en marche, l'étude si le cycle l'active, puis
 * pour la Pratique et l'Application actives leur pièce générique et les objets
 * de leur rampe, dans l'ordre de la rampe.
 */
export function piecesOf(
  plan: AcquisitionPlan,
  library: LibraryItem[],
  domainEmoji = '',
): Piece[] {
  const base = { skill_id: plan.skill_id, plan_id: plan.id }
  const out: Piece[] = []
  const push = (p: Omit<Piece, 'key'>) =>
    out.push({ ...p, key: pieceKey(p.act) })
  if (plan.recall_next_due_at)
    push({
      phase: 'study',
      emoji: '🧠',
      title: 'Interro',
      generic: false,
      head: false,
      done: false,
      due: at(plan.recall_next_due_at),
      act: { ...base, kind: 'recall' },
    })
  if (plan.study)
    push({
      phase: 'study',
      emoji: '📓',
      title: 'Étude',
      generic: false,
      head: true,
      done: plan.study_mastered,
      due: null,
      act: { ...base, kind: 'study' },
    })
  const ramp = rampOf(plan, library)
  for (const nature of ['isolated', 'situation'] as const) {
    if (!plan[nature]) continue
    push({
      phase: nature,
      emoji: '',
      title: nature === 'isolated' ? 'Pratique' : 'Mise en situation',
      generic: true,
      head: true,
      done: false,
      due: null,
      act: { ...base, kind: 'practice', nature },
    })
    for (const item of ramp.filter((i) => i.nature === nature))
      push({
        phase: nature,
        emoji: item.emoji || domainEmoji || '🧺',
        title: item.title,
        generic: false,
        head: false,
        done: item.mastered,
        due: null,
        criterion: {
          passes: item.criterion_passes,
          level: item.criterion_level,
          reached: item.mastered
            ? item.criterion_passes
            : Math.min(item.criterion_passes, item.passes_at_level),
        },
        act: { ...base, kind: 'practice', practice_item_id: item.id },
      })
  }
  return out
}

/**
 * Le cycle dont un savoir tire ses pièces : celui en cours, sinon le prévu —
 * de préférence celui d'un des projets donnés. Aucun : le savoir n'a pas de
 * pièce (pas d'acte sans cycle, #107 point 15).
 */
export function piecesCycle(
  plans: AcquisitionPlan[],
  projectIds: string[] = [],
): AcquisitionPlan | null {
  const active = plans.find((p) => p.state === 'active')
  if (active) return active
  const drafts = plans.filter((p) => p.state === 'draft')
  return (
    drafts.find((p) => p.project_ids.some((o) => projectIds.includes(o))) ??
    drafts.at(-1) ??
    null
  )
}

/** Le libellé d'un acte générique : « Pratique », « Mise en situation ». */
export const genericTitle = (nature: PracticeNature) =>
  nature === 'isolated' ? 'Pratique' : 'Mise en situation'

/**
 * La pièce que lit un acte posé qui n'est pas (plus) une pièce du cycle — un
 * objet sorti de la rampe, un acte d'avant : il reste lisible et se retire.
 */
export function pieceOfAct(
  a: ActSet & { item_title?: string | null; item_emoji?: string | null },
  domainEmoji = '',
): Piece {
  const base = {
    key: pieceKey(a),
    done: false,
    due: null,
    act: {
      skill_id: a.skill_id,
      kind: a.kind,
      plan_id: a.plan_id,
      practice_item_id: a.practice_item_id,
      nature: a.nature,
    },
  }
  if (a.kind === 'study')
    return {
      ...base,
      phase: 'study',
      emoji: '📓',
      title: 'Étude',
      generic: false,
      head: true,
    }
  if (a.kind === 'recall')
    return {
      ...base,
      phase: 'study',
      emoji: '🧠',
      title: 'Interro',
      generic: false,
      head: false,
    }
  if (a.nature)
    return {
      ...base,
      phase: a.nature,
      emoji: '',
      title: genericTitle(a.nature),
      generic: true,
      head: true,
    }
  return {
    ...base,
    phase: 'isolated',
    emoji: a.item_emoji || domainEmoji || '🧺',
    title: a.item_title ?? 'Exercice',
    generic: false,
    head: false,
  }
}
