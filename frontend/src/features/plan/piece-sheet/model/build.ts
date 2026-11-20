import {
  type Activity,
  type ActivityAct,
  takesFeedback,
} from '@/entities/activity'
import {
  type AcquisitionPlan,
  type Piece,
  PHASES,
  type RampItem,
  recallStep,
} from '@/entities/plan'
import {
  type RecallSession,
  type RecallSessionSummary,
  VERDICT_LABELS,
} from '@/entities/recall'
import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'

import type {
  PieceSheetBox,
  PieceSheetCurve,
  PieceSheetData,
  PieceSheetPass,
} from './types'

/**
 * Construire la fiche d'une pièce (#137, #138, `kit/Fiche piece`) depuis ce
 * que la page savoir a déjà chargé : le cycle, sa rampe, les séances du
 * savoir, l'historique de l'interro. Fonctions pures — `today` se passe pour
 * les tests.
 */

type Nature = RampItem['nature']

/** Ce que toutes les fiches de pratique lisent. */
export interface PracticeSheetContext {
  plan: AcquisitionPlan
  /** Les séances du savoir (`useActivities({ skillId })`). */
  activities: Activity[]
  /** L'emoji d'un objet qui n'en a pas : celui du domaine. */
  domainEmoji?: string
  today?: Date
}

/** Ce que la fiche de l'interro lit. */
export interface RecallSheetContext {
  plan: AcquisitionPlan
  /** Les passations terminées (`useRecallHistory`). */
  history: RecallSessionSummary[]
  /** La passation ouverte (`useRecallSession(plan.recall_session_id)`). */
  openSession?: RecallSession | null
  today?: Date
}

export type PieceSheetContext = PracticeSheetContext &
  Omit<RecallSheetContext, 'plan' | 'today'> & {
    /** La rampe du cycle (`rampOf`). */
    ramp: RampItem[]
  }

/** Un cycle clos : ni Planifier ni verdict. */
const isClosed = (plan: AcquisitionPlan) =>
  plan.state === 'completed' || plan.state === 'abandoned'

/** « jeu. 22 » : le jour court du rail. */
export function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
  })
}

const phaseLabel = (nature: Nature) =>
  PHASES.find((p) => p.nature === nature)?.label ?? ''

/**
 * Les séances du cycle qui portent un acte choisi par `match`, de la plus
 * récente à la plus ancienne. Une séance non datée n'a pas de place dans le
 * fil (ni jour ni mois) : elle est sautée. La note est le **retour** de la
 * passe (#139), sinon la note de la séance.
 */
function practicePasses(
  activities: Activity[],
  plan: AcquisitionPlan,
  match: (act: ActivityAct) => boolean,
  todayISO: string,
): PieceSheetPass[] {
  return activities
    .flatMap((a) => {
      const act = a.acts.find((x) => x.plan_id === plan.id && match(x))
      if (!act || !a.start_at) return []
      const day = toDateISO(new Date(a.start_at))
      return [
        {
          at: a.start_at,
          pass: {
            key: `${a.id}:${act.id}`,
            day,
            title: a.title,
            mark: a.done ? 'done' : day < todayISO ? 'missed' : 'planned',
            note: act.feedback?.trim() || a.notes?.trim() || null,
            level: act.level,
            feedback:
              a.done && takesFeedback(act)
                ? {
                    activityId: a.id,
                    actId: act.id,
                    level: act.level,
                    feedback: act.feedback,
                  }
                : null,
          } satisfies PieceSheetPass,
        },
      ]
    })
    .sort((x, y) => y.at.localeCompare(x.at))
    .map((x) => x.pass)
}

/** Compte, dernière et prochaine d'un fil de séances. */
function railOf(passes: PieceSheetPass[]) {
  const done = passes.filter((p) => p.mark === 'done')
  // Le fil descend : la prochaine est la plus proche des séances à venir.
  const next = passes.filter((p) => p.mark === 'planned').at(-1)
  return {
    count: done.length,
    last: done[0]?.day ?? null,
    next: next ? { label: shortDay(next.day), alert: false } : null,
  }
}

const STATEMENT = { generated: 'Généré', uploaded: 'Uploadé' } as const
const SOLUTION = { generated: 'Générée', uploaded: 'Uploadée' } as const

/** La fiche d'un objet de la rampe : exercice, mise en situation, intégré. */
export function practiceSheet(
  item: RampItem,
  {
    plan,
    activities,
    domainEmoji = '',
    today = new Date(),
  }: PracticeSheetContext,
): PieceSheetData {
  const situation = item.nature === 'situation'
  const integrated = item.kind === 'integrated'
  const closed = isClosed(plan)
  const passes = practicePasses(
    activities,
    plan,
    (x) => x.practice_item_id === item.id,
    toDateISO(today),
  )
  const rail = railOf(passes)
  const box: PieceSheetBox = {
    text: item.instructions?.trim()
      ? {
          title: situation ? 'Critères de réussite' : 'Instructions',
          body: item.instructions,
        }
      : null,
    reference: item.reference?.trim() || null,
    integrated: integrated
      ? {
          statement: item.statement_source
            ? STATEMENT[item.statement_source]
            : 'À définir',
          solution: item.solution_source
            ? SOLUTION[item.solution_source]
            : 'À définir',
          evaluation:
            item.eval_mode === 'sophia'
              ? 'Sophia, contre la solution'
              : 'Auto-évaluation',
        }
      : null,
    curve: null,
  }
  return {
    kind: integrated ? 'integrated' : situation ? 'situation' : 'exercise',
    title: item.title,
    emoji: item.emoji || domainEmoji || '🧺',
    phase: item.nature,
    phaseLabel: phaseLabel(item.nature),
    // Réussi(e) : le critère rempli, ou le verdict posé à la main (#157).
    state: item.mastered
      ? { tone: 'done', label: situation ? 'Réussie' : 'Réussi' }
      : rail.count
        ? { tone: 'progress', label: 'En cours' }
        : { tone: 'todo', label: 'Jamais fait' },
    criterion: {
      passes: item.criterion_passes,
      level: item.criterion_level,
      reached: item.mastered
        ? item.criterion_passes
        : Math.min(item.criterion_passes, item.passes_at_level),
    },
    ...rail,
    box: box.text || box.reference || box.integrated ? box : null,
    passes,
    // Seul un objet manuel se juge à la main, et dans un cycle non clos ;
    // un intégré se validera en le passant. Le verdict pose `done` : il force
    // la maîtrise, critère rempli ou non.
    verdict:
      item.kind === 'manual' && !closed
        ? {
            label: situation ? 'Mise en situation réussie' : 'Exercice réussi',
            done: item.done,
          }
        : null,
    actions: {
      plan: !closed,
      edit: true,
      open: integrated,
      recall: null,
      restart: false,
      close: false,
    },
    openRecall: null,
  }
}

/** La fiche de la pièce générique d'une phase (« Pratique libre ») : comme un
 *  exercice, sans encadré, sans verdict ni Modifier. */
export function genericSheet(
  nature: Nature,
  { plan, activities, today = new Date() }: PracticeSheetContext,
): PieceSheetData {
  const passes = practicePasses(
    activities,
    plan,
    (x) => x.nature === nature && !x.practice_item_id,
    toDateISO(today),
  )
  const rail = railOf(passes)
  return {
    kind: 'generic',
    title: nature === 'isolated' ? 'Pratique libre' : 'Mise en situation libre',
    emoji: '',
    phase: nature,
    phaseLabel: phaseLabel(nature),
    state: rail.count
      ? { tone: 'progress', label: 'En cours' }
      : { tone: 'todo', label: 'Sans exercice' },
    criterion: null,
    ...rail,
    box: null,
    passes,
    verdict: null,
    actions: {
      plan: !isClosed(plan),
      edit: false,
      open: false,
      recall: null,
      restart: false,
      close: false,
    },
    openRecall: null,
  }
}

/** « 12 sur 12 · 10 au premier essai » ; avant le 07/10/2026, l'ancien
 *  verdict : « Partiel · 8 sur 12 ». */
function sessionNote(s: RecallSessionSummary): string {
  const known = s.known_count ?? 0
  return s.verdict
    ? `${VERDICT_LABELS[s.verdict]} · ${known} sur ${s.total}`
    : `${s.total} sur ${s.total} · ${known} au premier essai`
}

const pass = (
  p: Pick<PieceSheetPass, 'key' | 'day' | 'title' | 'mark'> &
    Partial<PieceSheetPass>,
): PieceSheetPass => ({ note: null, level: null, feedback: null, ...p })

/**
 * La fiche de l'interro (#138) — elle remplace sa modale. Le stade reste en
 * pastille ; dû ou en retard, c'est « Prochaine » qui le dit, en rose. Le fil
 * : la passation ouverte en tête, la prochaine interro, puis les passations,
 * « Recommencée » et « Test lancé » en événements. Lancer la courbe ne se
 * fait pas d'ici (#157) : c'est « Lancer l'interro », sur la tuile de l'Étude.
 */
export function recallSheet({
  plan,
  history,
  openSession,
  today = new Date(),
}: RecallSheetContext): PieceSheetData {
  const todayISO = toDateISO(today)
  const stage = plan.recall_stage
  const due = plan.recall_next_due_at
  const status: PieceSheetCurve['status'] = plan.recall_finished
    ? 'finished'
    : stage == null
      ? 'idle'
      : due
        ? 'running'
        : 'stopped'
  const when =
    status === 'running' && due
      ? due === todayISO
        ? 'due'
        : due < todayISO
          ? 'overdue'
          : 'later'
      : null
  const open =
    openSession && openSession.id === plan.recall_session_id
      ? openSession
      : null
  const openLabel = open
    ? `${open.answers.filter((a) => a.known).length} sur ${open.total} sues`
    : null
  const closed = isClosed(plan)

  const questions = `${plan.question_count} question${plan.question_count > 1 ? 's' : ''}`
  const caption =
    status === 'finished'
      ? 'courbe terminée'
      : status === 'stopped'
        ? 'arrêtée à la clôture'
        : status === 'idle'
          ? 'pas lancée'
          : when === 'due'
            ? "aujourd'hui"
            : when === 'overdue'
              ? `en retard depuis le ${formatDateShort(due as string)}`
              : `prochaine le ${formatDateShort(due as string)}`

  const rows: { at: string; pass: PieceSheetPass }[] = [
    ...(open
      ? [
          {
            at: '9999',
            pass: pass({
              key: 'open',
              day: open.day,
              title: 'Interro',
              mark: 'open',
              note: `En cours · ${openLabel}`,
            }),
          },
        ]
      : due && status === 'running'
        ? [
            {
              at: '9998',
              pass: pass({
                key: 'next',
                day: due,
                title: 'Interro',
                mark: 'planned',
              }),
            },
          ]
        : []),
    ...history.map((s) => ({
      at: s.finished_at ?? s.started_at,
      pass: pass({
        key: s.id,
        day: s.day,
        title: 'Interro',
        mark: 'done',
        note: sessionNote(s),
      }),
    })),
    ...plan.recall_restarted_at.map((at) => ({
      at,
      pass: pass({
        key: `restart-${at}`,
        day: toDateISO(new Date(at)),
        title: 'Recommencée',
        mark: 'restart',
      }),
    })),
    ...(plan.recall_launched_at
      ? [
          {
            at: plan.recall_launched_at,
            pass: pass({
              key: 'launch',
              day: toDateISO(new Date(plan.recall_launched_at)),
              title: 'Test lancé',
              mark: 'launch',
            }),
          },
        ]
      : []),
  ]
  const passes = rows
    .sort((x, y) => y.at.localeCompare(x.at))
    .map((r) => r.pass)

  return {
    kind: 'recall',
    title: 'Interro',
    emoji: '🧠',
    phase: 'study',
    phaseLabel: 'Étude',
    state:
      status === 'finished'
        ? { tone: 'done', label: 'Terminée' }
        : status === 'stopped'
          ? { tone: 'todo', label: 'Arrêtée' }
          : status === 'idle'
            ? { tone: 'todo', label: 'Pas lancée' }
            : { tone: 'progress', label: recallStep(stage ?? 0) },
    criterion: null,
    count: history.length,
    last: passes.find((p) => p.mark === 'done')?.day ?? null,
    next:
      when === 'due'
        ? { label: "Aujourd'hui", alert: true }
        : when === 'overdue'
          ? { label: `Depuis ${shortDay(due as string)}`, alert: true }
          : when === 'later'
            ? { label: shortDay(due as string), alert: false }
            : null,
    box: {
      text: null,
      reference: null,
      integrated: null,
      curve: {
        status,
        stage: stage ?? 0,
        caption: `${questions} · ${caption}`,
      },
    },
    passes,
    verdict: null,
    actions: {
      plan: !closed,
      edit: false,
      open: false,
      // Plus de passation en avance (#138 point 4) ; une passation ouverte
      // se reprend toujours.
      recall: open
        ? 'resume'
        : when === 'due' || when === 'overdue'
          ? 'take'
          : null,
      // Une courbe démarrée, sauf arrêtée à la clôture (règle de
      // `POST /plans/{id}/recall/restart`).
      restart:
        stage != null &&
        status !== 'stopped' &&
        (plan.state === 'active' || plan.recall_in_retention),
      close: status === 'finished' || status === 'stopped',
    },
    openRecall: openLabel,
  }
}

/**
 * La fiche d'une pièce de la page savoir (`Piece` d'`entities/plan`) :
 * l'interro, une pièce générique, un objet de la rampe. L'étude n'a pas de
 * fiche (`null` : son clic ouvre les notes), ni un objet absent de la rampe
 * chargée.
 */
export function pieceSheet(
  piece: Piece,
  ctx: PieceSheetContext,
): PieceSheetData | null {
  const { act } = piece
  if (act.kind === 'study') return null
  if (act.kind === 'recall')
    return recallSheet({
      plan: ctx.plan,
      history: ctx.history,
      openSession: ctx.openSession,
      today: ctx.today,
    })
  if (act.nature) return genericSheet(act.nature, ctx)
  const item = ctx.ramp.find((i) => i.id === act.practice_item_id)
  return item ? practiceSheet(item, ctx) : null
}
