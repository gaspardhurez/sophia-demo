import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useActivities, useSetActFeedback } from '@/entities/activity'
import { domainColor, useDomains } from '@/entities/domain'
import {
  pieceOfAct,
  piecesOf,
  rampOf,
  usePlans,
  useRestartRecall,
  useUpdatePlanItem,
} from '@/entities/plan'
import { usePracticeItems } from '@/entities/practice'
import {
  useRecallHistory,
  useRecallSession,
  useStartRecall,
} from '@/entities/recall'
import { useSkill } from '@/entities/skill'
import { FeedbackEditor } from '@/features/activity/edit'
import { type FixedPiece, PlanActivityDialog } from '@/features/activity/plan'
import {
  PieceSheet,
  pieceSheet,
  type PieceSheetEditor,
} from '@/features/plan/piece-sheet'
import { PracticeItemEditor } from '@/features/practice/edit-item'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

/** La pièce à ouvrir : son savoir, son cycle, et l'acte qui la porte. */
export interface PieceTarget {
  skillId: string
  planId: string
  act: {
    skill_id: string
    plan_id?: string | null
    kind: 'study' | 'recall' | 'practice'
    practice_item_id?: string | null
    nature?: 'isolated' | 'situation' | null
    item_title?: string | null
    item_emoji?: string | null
  }
}

const fail = (err: unknown, fallback: string) =>
  toast.error(err instanceof ApiError ? err.message : fallback)

/**
 * La **fiche d'une pièce** hors de la page savoir (27/10 : une étiquette du
 * hub ouvre la fiche de sa pièce, pas la séance) : elle charge elle-même le
 * cycle, la bibliothèque, les séances et l'historique de l'interro, et porte
 * les mêmes gestes que sur la page savoir — verdict, Planifier, Passer ou
 * reprendre l'interro, Recommencer, le retour d'une passe, Modifier.
 */
export function PieceSheetHost({
  target,
  onClose,
}: {
  target: PieceTarget
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: skill } = useSkill(target.skillId)
  const { data: domains } = useDomains()
  const { data: plans } = usePlans(target.skillId)
  const { data: library } = usePracticeItems(target.skillId)
  const { data: activities } = useActivities({ skillId: target.skillId })
  const plan = plans?.find((p) => p.id === target.planId)
  const { data: history } = useRecallHistory(plan?.id)
  const { data: openSession } = useRecallSession(
    plan?.recall_session_id ?? undefined,
  )
  const updateItem = useUpdatePlanItem()
  const restartRecall = useRestartRecall()
  const startRecall = useStartRecall()
  const setFeedback = useSetActFeedback()
  const [editing, setEditing] = useState(false)
  const [planning, setPlanning] = useState<'item' | FixedPiece | null>(null)

  const domain = domains?.find((d) => d.id === skill?.domain_id)
  const emoji = domain?.emoji ?? ''
  const ramp = useMemo(
    () => (plan ? rampOf(plan, library ?? []) : []),
    [plan, library],
  )
  if (!plan || !skill || !library) return null

  // La pièce du cycle, sinon celle que lit l'acte (un objet sorti de la
  // rampe reste lisible).
  const fallback = pieceOfAct(
    { ...target.act, plan_id: plan.id } as Parameters<typeof pieceOfAct>[0],
    emoji,
  )
  const piece =
    piecesOf(plan, library, emoji).find((p) => p.key === fallback.key) ??
    fallback
  const built = pieceSheet(piece, {
    plan,
    activities: activities ?? [],
    ramp,
    history: history ?? [],
    openSession: openSession ?? null,
    domainEmoji: emoji,
  })
  // L'étude n'a pas de fiche (sur la page savoir, son clic ouvre les notes).
  if (!built) return null
  const sheet = built
  const item = piece.act.practice_item_id
    ? (ramp.find((i) => i.id === piece.act.practice_item_id) ?? null)
    : null
  const closed = plan.state === 'completed' || plan.state === 'abandoned'

  function takeRecall() {
    startRecall
      .mutateAsync(plan!.id)
      .then((s) => navigate(`/interro/${s.id}`))
      .catch((err) => fail(err, "L'interro n'a pas pu s'ouvrir"))
  }

  function render(editor?: PieceSheetEditor) {
    return (
      <PieceSheet
        data={sheet}
        color={domain?.color}
        onClose={onClose}
        onEdit={item ? () => setEditing(true) : undefined}
        editor={editor}
        onPlan={() => {
          if (item) setPlanning('item')
          else if (sheet.kind === 'recall') setPlanning('recall')
          else if (
            sheet.kind === 'generic' &&
            (sheet.phase === 'isolated' || sheet.phase === 'situation')
          )
            setPlanning(sheet.phase)
        }}
        onVerdict={
          item
            ? (done) =>
                void updateItem
                  .mutateAsync({
                    planId: plan!.id,
                    itemId: item.id,
                    body: { done },
                  })
                  .catch((err) => fail(err, 'La mise à jour a échoué'))
            : undefined
        }
        verdictPending={updateItem.isPending}
        onRecall={takeRecall}
        recallPending={startRecall.isPending}
        onRestart={() => restartRecall.mutateAsync(plan!.id)}
        feedbackEditor={(pass, close) => (
          <FeedbackEditor
            level={pass.feedback.level}
            feedback={pass.feedback.feedback}
            pending={setFeedback.isPending}
            onCancel={close}
            onSave={(level, feedback) =>
              void setFeedback
                .mutateAsync({
                  id: pass.feedback.activityId,
                  actId: pass.feedback.actId,
                  level,
                  feedback: feedback.trim() || null,
                })
                .then(close)
                .catch((err) => fail(err, "Le retour n'a pas été gardé"))
            }
          />
        )}
      />
    )
  }

  if (planning && domain)
    return (
      <PlanActivityDialog
        skillId={skill.id}
        skillName={skill.name}
        domainId={domain.id}
        accent={domainColor(domain.color)}
        domainEmoji={emoji}
        target={planning === 'item' ? item : undefined}
        piece={planning === 'item' ? undefined : planning}
        projectIds={plan.project_ids}
        initialDay={
          planning === 'recall' && plan.recall_next_due_at
            ? new Date(
                Math.max(
                  Date.now(),
                  new Date(`${plan.recall_next_due_at}T00:00:00`).getTime(),
                ),
              )
            : undefined
        }
        planId={closed ? undefined : plan.id}
        onOpenChange={(o) => {
          if (!o) onClose()
        }}
      />
    )

  if (item && editing)
    return (
      <PracticeItemEditor
        item={item}
        planId={closed ? undefined : plan.id}
        onDone={() => setEditing(false)}
        onDeleted={onClose}
      >
        {(parts) => render(parts)}
      </PracticeItemEditor>
    )

  return render()
}
