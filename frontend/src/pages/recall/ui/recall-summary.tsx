import { Check } from 'lucide-react'

import { RecallCurve, recallStep } from '@/entities/plan'
import { curveAfter, type RecallSession } from '@/entities/recall'
import { addDays, toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'
import { Button } from '@/shared/ui'

import { NotesLink } from './notes-link'

/**
 * Le bilan (#103, 6p à 6s) : le rail vidé ; « Interro terminée » (26 px), la
 * frise au nouveau rang, « Prochaine interro le …, à J+x. » — ou « Courbe
 * terminée. » après J+90 —, puis toutes les questions, chacune avec ses ✕
 * rosés puis ✓ (↗ notes au clic), et **Terminer**. Le score au premier essai
 * reste en base, il ne s'affiche plus.
 */
export function RecallSummary({
  session,
  ink,
  inkClassName,
  ringClassName,
  onDone,
}: {
  session: RecallSession
  ink: string
  /** Les classes du domaine pour la frise. */
  inkClassName: string
  ringClassName: string
  onDone: () => void
}) {
  const curve = curveAfter(session)
  const answers = [...session.answers].sort((a, b) => a.position - b.position)
  return (
    <div className="flex flex-1 flex-col gap-4 pt-3.5">
      <span className="font-heading text-[26px] font-bold tracking-[-0.02em]">
        Interro terminée
      </span>
      <div className="flex flex-col gap-1.5">
        <RecallCurve
          {...curve}
          fillClassName={inkClassName}
          ringClassName={ringClassName}
        />
        <span className="text-[13px]">{nextLine(session)}</span>
      </div>
      <ul className="flex flex-col">
        {answers.map((a) => {
          const misses = a.attempts.filter((t) => t.known === false).length
          const row = (
            <>
              <span className="min-w-0 flex-1 text-[13px]">{a.prompt}</span>
              <span className="flex shrink-0 items-center gap-1">
                {Array.from({ length: misses }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="text-[11px] font-bold text-red-400"
                  >
                    ✕
                  </span>
                ))}
                <span
                  aria-label="Sue"
                  className="grid size-[18px] place-items-center rounded-full text-white"
                  style={{ background: ink }}
                >
                  <Check className="size-[11px]" strokeWidth={3} />
                </span>
              </span>
            </>
          )
          return (
            <li key={a.id} className="border-t first:border-t-0">
              {a.question_id ? (
                <NotesLink
                  skillId={session.skill_id}
                  questionId={a.question_id}
                  className="group flex items-center gap-3 py-2 hover:bg-muted/40 [&>svg]:hidden"
                >
                  {row}
                </NotesLink>
              ) : (
                <div className="flex items-center gap-3 py-2">{row}</div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-auto flex justify-end pt-2">
        <Button onClick={onDone}>Terminer</Button>
      </div>
    </div>
  )
}

/** « Prochaine interro le 14 oct., à J+7. » ; « … demain. » ; « Courbe
 *  terminée. » après J+90. */
function nextLine(session: RecallSession): string {
  const due = session.next_due_on
  if (!due) return 'Courbe terminée.'
  const tomorrow = toDateISO(addDays(new Date(), 1))
  if (due === tomorrow) return 'Prochaine interro demain.'
  const step = recallStep(session.stage_after ?? 0)
  return `Prochaine interro le ${formatDateShort(due)}, à ${step}.`
}
