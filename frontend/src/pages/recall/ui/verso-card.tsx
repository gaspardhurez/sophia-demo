import { ArrowUpRight, Check, Hourglass, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { RecallAnswer } from '@/entities/recall'
import { cn } from '@/shared/lib/utils'

import { CARD } from './card-stack'
import { Passages } from './passages'

const LABEL =
  'text-[11px] font-semibold tracking-[.05em] text-muted-foreground uppercase'

/**
 * Le verso d'une carte (#103) : la question en petit, puis la correction.
 * - **Réponse libre** : « Ta réponse » et la réponse attendue côte à côte,
 *   « Relire les notes ↗ | ⌛ 10 min » sous l'attendue, et deux ronds de
 *   48 px, ✕ Pas su (bord rouge) et ✓ Su (encre du domaine).
 * - **Liste** : « Toi » (ta réponse), puis les éléments **un à un**, chacun
 *   seul au centre (« 2 sur 3 »), ✕ / ✓ ; les tranchés se comptent
 *   au-dessus (« ✓ 3 · ✕ 1 », noms au survol). Le clic sur le dernier lance
 *   l'issue, sans autre bouton.
 */
export function VersoCard({
  answer,
  failures,
  draft,
  skillId,
  ink,
  inkSoft,
  pending,
  onJudge,
  onJudgeList,
  onPreview,
  decided,
}: {
  answer: RecallAnswer
  failures: number
  draft: string
  skillId: string
  /** L'encre du domaine, et sa teinte pâle (chips d'éléments donnés). */
  ink: string
  inkSoft: string
  pending: boolean
  onJudge: (known: boolean) => void
  /** Liste : les ids des éléments donnés. */
  onJudgeList: (given: string[]) => void
  /** Au survol de « Relire les notes » : l'aperçu de son effet sur le rail. */
  onPreview: (on: boolean) => void
  /** Liste figée (la carte qui sort) : les verdicts déjà rendus. */
  decided?: boolean[]
}) {
  const text = draft.trim()
  const notes = answer.question_id ? (
    <ReadNotes
      skillId={skillId}
      questionId={answer.question_id}
      ink={ink}
      inkSoft={inkSoft}
      onPreview={onPreview}
    />
  ) : null

  return (
    <div className={cn(CARD, 'min-h-0 flex-1 gap-3')}>
      {failures > 0 && <Passages failures={failures} current />}
      <span className="text-center font-heading text-base leading-[1.3] font-semibold tracking-[-0.01em] text-balance text-muted-foreground">
        {answer.prompt}
      </span>
      {answer.form === 'list' ? (
        <ListVerso
          answer={answer}
          text={text}
          ink={ink}
          inkSoft={inkSoft}
          pending={pending}
          onJudge={onJudgeList}
          notes={notes}
          decided={decided}
        />
      ) : (
        <>
          <div className="grid min-h-0 flex-1 gap-2.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted/60 p-3">
              <span className={LABEL}>Ta réponse</span>
              <span
                className={cn(
                  'text-[13.5px] leading-[1.55] whitespace-pre-wrap',
                  !text && 'text-muted-foreground',
                )}
              >
                {text || 'Pas de réponse'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-[10px] border p-3">
              <span className={LABEL}>Réponse attendue</span>
              <span className="text-[13.5px] leading-[1.55] whitespace-pre-wrap">
                {answer.expected_answer ?? ''}
              </span>
              <div className="mt-auto pt-2">{notes}</div>
            </div>
          </div>
          <div className="flex justify-center gap-5">
            <JudgeButton
              known={false}
              size="lg"
              ink={ink}
              pending={pending}
              onClick={() => onJudge(false)}
            />
            <JudgeButton
              known
              size="lg"
              ink={ink}
              pending={pending}
              onClick={() => onJudge(true)}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Une liste : « Toi », puis un élément à la fois ; le dernier tranché lance
 *  l'issue. */
function ListVerso({
  answer,
  text,
  ink,
  inkSoft,
  pending,
  onJudge,
  notes,
  decided,
}: {
  answer: RecallAnswer
  text: string
  ink: string
  inkSoft: string
  pending: boolean
  onJudge: (given: string[]) => void
  notes: ReactNode
  decided?: boolean[]
}) {
  // Les verdicts, élément par élément, dans l'ordre.
  const [verdicts, setVerdicts] = useState<boolean[]>(decided ?? [])
  const points = answer.points
  const index = verdicts.length
  const point = points[index]

  function decide(known: boolean) {
    const next = [...verdicts, known]
    setVerdicts(next)
    if (next.length === points.length)
      onJudge(points.filter((_, i) => next[i]).map((p) => p.id))
  }

  return (
    <>
      <div className="flex gap-2 rounded-[10px] bg-muted/60 px-3 py-2 text-[13px] leading-[1.5]">
        <span className="pt-px text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
          Toi
        </span>
        <span
          className={cn(
            'whitespace-pre-wrap',
            !text && 'text-muted-foreground',
          )}
        >
          {text || 'Pas de réponse'}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-[10px] border p-3">
        {verdicts.length > 0 && (
          <div className="flex gap-[5px]">
            <Tally
              known
              items={points.filter((_, i) => verdicts[i] === true)}
              ink={ink}
              inkSoft={inkSoft}
            />
            <Tally
              known={false}
              items={points.filter((_, i) => verdicts[i] === false)}
              ink={ink}
              inkSoft={inkSoft}
            />
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-2 text-center">
          {point && (
            <>
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                {index + 1} sur {points.length}
              </span>
              <span className="font-heading text-[15px] font-semibold text-balance">
                {point.text}
              </span>
              <div className="flex gap-3.5">
                <JudgeButton
                  known={false}
                  size="sm"
                  ink={ink}
                  pending={pending}
                  onClick={() => decide(false)}
                />
                <JudgeButton
                  known
                  size="sm"
                  ink={ink}
                  pending={pending}
                  onClick={() => decide(true)}
                />
              </div>
            </>
          )}
        </div>
        {notes}
      </div>
    </>
  )
}

/** Le compte des éléments tranchés d'un côté (« ✓ 3 », « ✕ 1 »), leurs noms
 *  au survol. Un compteur plutôt qu'une chip par élément : les chips
 *  s'empilaient et poussaient l'élément en cours hors de la carte. */
function Tally({
  known,
  items,
  ink,
  inkSoft,
}: {
  known: boolean
  items: { id: string; text: string }[]
  ink: string
  inkSoft: string
}) {
  if (items.length === 0) return null
  return (
    <span
      title={items.map((p) => p.text).join('\n')}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium tabular-nums',
        !known && 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300',
      )}
      style={known ? { background: inkSoft, color: ink } : undefined}
    >
      <span aria-hidden>{known ? '✓' : '✕'}</span>
      {items.length}
      <span className="sr-only">{known ? 'su' : 'pas su'}</span>
    </span>
  )
}

function JudgeButton({
  known,
  size,
  ink,
  pending,
  onClick,
}: {
  known: boolean
  size: 'lg' | 'sm'
  ink: string
  pending: boolean
  onClick: () => void
}) {
  const Icon = known ? Check : X
  return (
    <button
      type="button"
      aria-label={known ? 'Su' : 'Pas su'}
      title={known ? 'Su' : 'Pas su'}
      disabled={pending}
      onClick={onClick}
      className={cn(
        'grid place-items-center rounded-full disabled:opacity-50',
        size === 'lg' ? 'size-12' : 'size-9',
        known
          ? 'text-white hover:opacity-90'
          : 'border-[1.5px] border-red-300 bg-card text-red-600 hover:bg-red-50 dark:border-red-400/50 dark:text-red-400 dark:hover:bg-red-400/10',
      )}
      style={known ? { background: ink } : undefined}
    >
      <Icon
        className={size === 'lg' ? 'size-5' : 'size-[15px]'}
        strokeWidth={2.4}
      />
    </button>
  )
}

/**
 * « Relire les notes ↗ | ⌛ 10 min » : un bouton scindé — les notes dans un
 * nouvel onglet, et ce que ça coûte : toutes les questions qui restent
 * attendent à nouveau dix minutes. Au survol, l'aperçu sur le rail.
 */
function ReadNotes({
  skillId,
  questionId,
  ink,
  inkSoft,
  onPreview,
}: {
  skillId: string
  questionId: string
  ink: string
  inkSoft: string
  onPreview: (on: boolean) => void
}) {
  return (
    <a
      href={`/skills/${skillId}/notes?question=${questionId}`}
      target="_blank"
      rel="noreferrer"
      title="Relire les notes"
      onMouseEnter={() => onPreview(true)}
      onMouseLeave={() => onPreview(false)}
      onFocus={() => onPreview(true)}
      onBlur={() => onPreview(false)}
      className="inline-flex h-[30px] self-start overflow-hidden rounded-[7px] border text-[12.5px] font-semibold whitespace-nowrap"
    >
      <span className="inline-flex items-center gap-[5px] bg-card px-2.5 hover:bg-muted">
        Relire les notes
        <ArrowUpRight className="size-3" />
      </span>
      <span
        className="inline-flex items-center gap-1 border-l px-2 text-xs"
        style={{ background: inkSoft, color: ink }}
      >
        <Hourglass className="size-2.5" strokeWidth={2.4} />
        10 min
      </span>
    </a>
  )
}
