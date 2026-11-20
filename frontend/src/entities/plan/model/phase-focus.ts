import type { components } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'

import type { PhaseKey } from './phases'
import { type Piece, pieceKey, pieceOfAct, piecesOf } from './pieces'
import { type PhaseProgress, type PhaseState, phasesProgress } from './progress'
import { type RampItem, rampOf } from './ramp'
import { recallStep } from './recall'
import {
  recallLaunched,
  recallNextLabel,
  recallReached,
  type StudyState,
  studyState,
} from './study'
import type { AcquisitionPlan } from './types'

/** Lu sur le contrat : `entities/practice` est une slice voisine. */
type LibraryItem = components['schemas']['PracticeItemRead']

/**
 * L'état d'une ligne de tuile (`kit/Phases cycle`, `v`) : validée (✓), des
 * passes sans verdict (demi-disque), jamais faite (anneau), objet gardé en
 * rétention (pointillé) ; la pièce générique n'a pas de pastille — elle ne
 * se valide pas, elle n'a pas à en avoir l'air.
 */
export type TileRowState = 'done' | 'doing' | 'todo' | 'generic' | 'kept'

/** Une ligne d'une tuile de phase : une pièce du cycle. */
export interface TileRow {
  piece: Piece
  /** L'objet de la rampe ; nul pour l'étude, l'interro et la générique. */
  item: RampItem | null
  /** Le titre affiché : « Notes » pour l'étude, « Pratique libre » pour la
   *  générique. */
  title: string
  state: TileRowState
  /** Les passes dans ce cycle (« 3 fois ») ; nulles sur une ligne gardée. */
  passes: number
  /** Le dernier niveau sur 5 (#139), s'il est connu. */
  level: number | null
  /** La pièce générique d'une phase validée : à l'encre du domaine, comme
   *  les pièces validées (elle n'a pas de verdict à elle). */
  inked?: boolean
  /** Le critère de maîtrise d'un objet de la rampe (#157) : `reached`
   *  passes au niveau sur `passes` attendues, à `level`/5 — toutes, une fois
   *  l'objet maîtrisé. Nul pour Notes, Interro, générique et gardé. */
  criterion: { passes: number; level: number; reached: number } | null
}

/** L'Étude lue sur son interro (#157) : ce que sa tuile en montre. */
export interface StudyTile {
  state: StudyState
  /** Crans franchis, bornés au seuil. */
  reached: number
  /** Le seuil : le nombre de tests (1 = J+1 … 5 = J+90). */
  target: number
  /** À droite de la ligne Interro (`recallNextLabel`). */
  next: string
  /** L'interro est en retard (jour dû passé) : `next` (« depuis … ») passe en
   *  chip rose, la même que dans Rattraper de la vue d'ensemble. */
  late: boolean
}

/** Une tuile : une phase, son anneau, ses lignes. */
export interface PhaseTile {
  key: PhaseKey
  label: string
  state: PhaseState
  /** Activée sur le cycle enregistré. */
  inCycle: boolean
  meta: string
  /** 0 → 1, ce que l'anneau dessine : maîtrisées / pièces (génériques et
   *  gardées exclues) ; l'Étude, crans franchis / seuil. */
  ratio: number
  /** Au centre de l'anneau : le prochain cran, « — » ou « ✓ » (Étude), le
   *  nombre de gardés (Rétention), sinon « 1/4 ». */
  fraction: string
  rows: TileRow[]
  /** L'Étude seulement : son interro. */
  study: StudyTile | null
}

/** Le titre d'une pièce générique dans sa tuile, que la phase nomme déjà. */
const GENERIC_TITLE = {
  isolated: 'Pratique libre',
  situation: 'Mise en situation libre',
} as const

function rowState(done: boolean, passes: number): TileRowState {
  return done ? 'done' : passes > 0 ? 'doing' : 'todo'
}

/**
 * Les tuiles d'un cycle (#136, `kit/Phases cycle`), dans l'ordre canonique —
 * l'état de chaque phase vient de `phasesProgress`, les pièces de `piecesOf`.
 *
 * - **Étude** (#157) : 📓 Notes — validées dès que le test est lancé —,
 *   puis l'Interro — pas lancée (sur un cycle prévu ou en cours), en marche
 *   ou terminée —, sauf sur une étude sans questions ou validée à la main.
 * - **Pratique / Mise en situation** : les objets de la rampe dans son ordre,
 *   même quand la phase est éteinte (ils y restent) ; la pièce générique en
 *   dernier, seulement si elle a été faite — jamais faite, elle n'a rien à
 *   dire que le titre de la tuile ne dise déjà.
 * - **Rétention** : les objets gardés.
 *
 * Une ligne d'objet est validée quand l'objet est **maîtrisé** (critère
 * rempli, ou verdict à la main). Les passes sont celles du cycle (`study_sessions`, `sessions` d'un objet,
 * `*_sessions` de la générique ; l'interro compte ses crans franchis). Le
 * dernier niveau se lit dans `levels`, par clé de pièce (`pieceKey`).
 */
export function phaseTiles(
  plan: AcquisitionPlan,
  library: LibraryItem[],
  {
    domainEmoji = '',
    levels,
    recallSession,
    today = new Date(),
  }: {
    domainEmoji?: string
    levels?: ReadonlyMap<string, number>
    /** Le titre de la séance qui porte la prochaine interro, si elle porte
     *  autre chose (« jeu. 15 · Tennis »). */
    recallSession?: string | null
    today?: Date
  } = {},
): PhaseTile[] {
  const ramp = rampOf(plan, library)
  const progress = phasesProgress(plan, ramp)
  // Toutes les pièces, phases éteintes comprises : une rampe éteinte garde
  // ses objets, et la tuile les montre.
  const pieces = piecesOf(
    { ...plan, study: true, isolated: true, situation: true },
    library,
    domainEmoji,
  )
  const level = (p: Piece) => levels?.get(p.key) ?? null
  const byItem = new Map(
    pieces
      .filter((p) => p.act.practice_item_id)
      .map((p) => [p.act.practice_item_id as string, p]),
  )
  const itemRow = (item: RampItem, kept = false): TileRow[] => {
    const piece = byItem.get(item.id)
    if (!piece) return []
    return [
      {
        piece,
        item,
        title: item.title,
        state: kept ? 'kept' : rowState(item.mastered, item.sessions),
        passes: kept ? 0 : item.sessions,
        level: kept ? null : level(piece),
        criterion: kept
          ? null
          : {
              passes: item.criterion_passes,
              level: item.criterion_level,
              reached: item.mastered
                ? item.criterion_passes
                : Math.min(item.criterion_passes, item.passes_at_level),
            },
      },
    ]
  }

  const study: StudyTile = {
    state: studyState(plan, today),
    reached: recallReached(plan),
    target: plan.recall_target,
    next: recallNextLabel(plan, { session: recallSession, today }),
    late:
      plan.recall_next_due_at != null &&
      plan.recall_next_due_at < toDateISO(today) &&
      !plan.study_mastered,
  }
  return progress.map((phase) => {
    const inCycle = Boolean(plan[phase.key])
    const rows = tileRows(phase, plan, pieces, ramp, itemRow, level, study)
    return {
      ...shape(phase, plan, rows, study),
      inCycle,
      rows,
      study: phase.key === 'study' ? study : null,
    }
  })
}

function tileRows(
  phase: PhaseProgress,
  plan: AcquisitionPlan,
  pieces: Piece[],
  ramp: RampItem[],
  itemRow: (item: RampItem, kept?: boolean) => TileRow[],
  level: (p: Piece) => number | null,
  study: StudyTile,
): TileRow[] {
  if (phase.key === 'study') {
    const rows: TileRow[] = []
    const notes = pieces.find((p) => p.act.kind === 'study')
    // Lancer le test, c'est dire « j'ai étudié » : les notes sont faites.
    const notesDone =
      plan.study_mastered ||
      recallLaunched(plan) ||
      plan.study_validated_at != null
    if (notes && (plan.study || plan.study_sessions > 0))
      rows.push({
        piece: notes,
        item: null,
        title: 'Notes',
        state: rowState(notesDone, plan.study_sessions),
        passes: plan.study_sessions,
        level: null,
        criterion: null,
      })
    // Pas lancée, l'Interro se montre déjà (son nombre de questions) sur un
    // cycle prévu ou en cours ; sans questions ou validée, jamais.
    const waiting =
      study.state === 'nonlancee' &&
      (plan.state === 'active' || plan.state === 'draft')
    if (recallLaunched(plan) ? study.state !== 'validee' : waiting) {
      // Terminée, la courbe n'a plus de rappel : `piecesOf` ne la donne pas.
      const recall =
        pieces.find((p) => p.act.kind === 'recall') ??
        pieceOfAct({
          skill_id: plan.skill_id,
          plan_id: plan.id,
          kind: 'recall',
        })
      const passes = study.reached
      rows.push({
        piece: recall,
        item: null,
        title: 'Interro',
        state: rowState(study.state === 'terminee', passes),
        passes,
        level: null,
        criterion: null,
      })
    }
    return rows
  }
  if (phase.key === 'retention')
    return ramp.filter((i) => i.in_retention).flatMap((i) => itemRow(i, true))

  const nature = phase.key
  const rows = ramp
    .filter((i) => i.nature === nature)
    .flatMap((i) => itemRow(i))
  const generic = pieces.find(
    (p) => p.key === pieceKey({ kind: 'practice', nature }),
  )
  const passes =
    nature === 'isolated' ? plan.isolated_sessions : plan.situation_sessions
  if (generic && passes > 0)
    rows.push({
      piece: generic,
      item: null,
      title: GENERIC_TITLE[nature],
      state: 'generic',
      passes,
      level: level(generic),
      inked: phase.state === 'done',
      criterion: null,
    })
  return rows
}

/** Méta, anneau et fraction d'une tuile, dans les mots de la maquette. */
function shape(
  phase: PhaseProgress,
  plan: AcquisitionPlan,
  rows: TileRow[],
  study: StudyTile,
): Pick<PhaseTile, 'key' | 'label' | 'state' | 'meta' | 'ratio' | 'fraction'> {
  const { key, label, state } = phase
  const off = !plan[key]
  if (key === 'study') {
    // `kit/Phases cycle` (#157) : l'anneau sur le prochain cran, le seuil
    // en méta tant qu'il n'est pas atteint.
    const s = study.state
    const done = s === 'terminee' || s === 'validee'
    return {
      key,
      label,
      state,
      meta: off
        ? 'Hors cycle'
        : s === 'terminee'
          ? 'Terminée'
          : s === 'validee'
            ? 'Validée'
            : s === 'sans'
              ? 'Sans questions'
              : `Terminée à ${recallStep(study.target - 1)}`,
      ratio: done ? 1 : study.reached / study.target,
      fraction: done
        ? '✓'
        : s === 'nonlancee' || s === 'sans'
          ? '—'
          : recallStep(study.reached),
    }
  }
  if (key === 'retention')
    return {
      key,
      label,
      state,
      meta: off ? 'Hors cycle' : phase.meta,
      ratio: 0,
      fraction: String(rows.length),
    }
  const counted = rows.filter((r) => r.state !== 'generic')
  const done = counted.filter((r) => r.state === 'done').length
  return {
    key,
    label,
    state,
    meta: off
      ? 'Hors cycle'
      : counted.length === 0
        ? 'Rien encore'
        : `${done} sur ${counted.length}`,
    ratio: counted.length ? done / counted.length : 0,
    fraction: `${done}/${counted.length}`,
  }
}

/**
 * Les phases au **focus** (#136, contour à l'encre du domaine) : toute phase
 * non validée qui a au moins une passe — plusieurs à la fois ; à défaut, la
 * prochaine phase ni validée ni éteinte qui a une pièce. Aucune : rien n'est
 * au focus.
 */
export function focusedPhases(
  tiles: Pick<PhaseTile, 'key' | 'state' | 'rows'>[],
): PhaseKey[] {
  const worked = tiles
    .filter((t) => t.state !== 'done' && t.rows.some((r) => r.passes > 0))
    .map((t) => t.key)
  if (worked.length) return worked
  const next = tiles.find(
    (t) => t.state !== 'done' && t.state !== 'off' && t.rows.length > 0,
  )
  return next ? [next.key] : []
}
