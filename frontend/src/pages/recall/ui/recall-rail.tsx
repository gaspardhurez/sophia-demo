import { Check, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { DomainColorValues } from '@/entities/domain'
import {
  formatWait,
  isWaiting,
  type RecallAnswer,
  RETRY_DELAY_MS,
  waitLeft,
} from '@/entities/recall'
import { cn } from '@/shared/lib/utils'

/**
 * Le rail de la passation (#103, `prod/Interro`) : 56 px à gauche, la tuile
 * 🧠, puis une pastille de 32 px par question, dans l'ordre de la file — ✓
 * plein (sue), numéro plein foncé (en jeu), chrono dans un anneau qui se
 * remplit (en attente), numéro gris (à venir). On ne voit l'intitulé
 * d'aucune question. × en bas. Plus haut que l'écran, il défile pour garder
 * la pastille en jeu au centre, fondu en haut et en bas.
 *
 * `preview` : au survol de « Relire les notes », les questions qui restent
 * prennent un anneau pointillé — l'effet du bouton, en aperçu.
 */
export function RecallRail({
  answers,
  currentId,
  now,
  released,
  preview,
  values,
  onQuit,
}: {
  /** Les questions, dans l'ordre de la file. */
  answers: RecallAnswer[]
  currentId: string | null
  now: number
  released: ReadonlySet<string>
  preview: boolean
  values: DomainColorValues
  onQuit: () => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentId])
  const overflow =
    (list.current?.scrollHeight ?? 0) > (list.current?.clientHeight ?? 0)

  return (
    <nav
      aria-label="Questions de l'interro"
      className="sticky top-0 flex h-svh w-14 shrink-0 flex-col items-center gap-2.5 border-r bg-card py-3"
    >
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-[7px] text-sm"
        style={{ background: values.soft }}
      >
        🧠
      </span>
      <span aria-hidden className="h-px w-5 shrink-0 bg-border" />
      <div
        ref={list}
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-hidden py-1.5"
        style={
          overflow
            ? {
                maskImage:
                  'linear-gradient(transparent, #000 32px, #000 calc(100% - 32px), transparent)',
              }
            : undefined
        }
      >
        {answers.map((a) => {
          const playing = a.id === currentId
          const waiting = isWaiting(a, now, released)
          const left = waitLeft(a, now)
          const number = String(a.position + 1)
          return (
            <span
              key={a.id}
              ref={playing ? current : undefined}
              aria-label={
                a.known
                  ? `Question ${number}, sue`
                  : playing
                    ? `Question ${number}, en jeu`
                    : waiting
                      ? `Question ${number}, revient dans ${formatWait(left)}`
                      : `Question ${number}, à venir`
              }
              className={cn(
                'relative grid size-8 shrink-0 place-items-center rounded-full font-bold tabular-nums',
                a.known && 'animate-pop text-[13px] text-white',
                !a.known &&
                  playing &&
                  'bg-foreground text-[13px] text-background',
                !a.known && waiting && 'text-[10px]',
                !a.known &&
                  !playing &&
                  !waiting &&
                  'bg-card text-[13px] text-muted-foreground shadow-[inset_0_0_0_1.5px] shadow-border',
                preview &&
                  !a.known &&
                  'outline-[1.5px] outline-offset-2 outline-muted-foreground/60 outline-dashed',
              )}
              style={
                a.known
                  ? { background: values.ink }
                  : waiting
                    ? { background: values.soft, color: values.ink }
                    : undefined
              }
            >
              {a.known ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : waiting ? (
                formatWait(left)
              ) : (
                number
              )}
              {waiting && (
                <svg
                  aria-hidden
                  viewBox="0 0 38 38"
                  className="pointer-events-none absolute -inset-[3px] size-[38px] -rotate-90"
                >
                  <circle
                    cx="19"
                    cy="19"
                    r="17"
                    fill="none"
                    stroke={values.ink}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="107"
                    strokeDashoffset={Math.round(
                      107 * Math.min(1, left / RETRY_DELAY_MS),
                    )}
                  />
                </svg>
              )}
            </span>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onQuit}
        aria-label="Quitter l'interro"
        title="Quitter (tes réponses sont gardées)"
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-[15px]" />
      </button>
    </nav>
  )
}
