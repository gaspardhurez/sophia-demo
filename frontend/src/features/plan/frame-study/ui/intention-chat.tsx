import { ArrowUp, Check, Mic } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import { useFramingCompanion } from '../model/companion'
import { useFieldDictation } from '../model/use-field-dictation'
import type { IntentionChat as Chat } from '../model/use-intention-chat'
import { ErrorLine, SophiaDots } from './parts'

/** Une réponse tient dans le champ du serveur (4000 caractères). */
const ANSWER_MAX = 4000
/** Entre les pastilles choisies et le texte libre, dans ce qui part. */
const JOIN = ' · '

/**
 * Le chat de l'intention (#175, `prod/Cadrer etude - Intention`), quand
 * Sophia peut poser ses questions :
 *
 * - en haut, l'encadré **Intention** dès qu'il y en a une (la première
 *   réponse, ou celle du cycle à la relance), estompé pendant que Sophia
 *   écrit ;
 * - les bulles : Sophia en rose à gauche, les réponses en gris plein à
 *   droite ; trois points pendant qu'elle écrit ; un échec, « Sophia n'a
 *   pas pu répondre. » et Réessayer ;
 * - au-dessus du champ, les **réponses proposées** en pastilles, à choisir
 *   à plusieurs (foncées + ✓) ; ce qui part = les pastilles choisies, puis
 *   le texte libre (↑ ou Entrée) ;
 * - dans le champ, le **micro** : « En écoute » et Arrêter, puis
 *   « Nettoyage… » ; le texte dicté s'ajoute au champ.
 *
 * Le champ se ferme tant que Sophia écrit, après un échec et une fois
 * qu'elle a ce qu'il lui faut.
 */
export function IntentionChat({
  chat,
  skillId,
  intention,
}: {
  chat: Chat
  skillId: string
  intention: string
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState('')
  const dictationAction = useFramingCompanion('dictation')
  const dictation = useFieldDictation(skillId, (dictated) =>
    setText((t) => (t.trim() ? `${t.trimEnd()} ${dictated}` : dictated)),
  )

  // Le champ se rouvre à chaque question : le curseur y revient.
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (chat.open) field.current?.focus()
  }, [chat.open])

  const answer = [...picked, text.trim()].filter(Boolean).join(JOIN)
  const canSend = chat.open && answer.length > 0

  function send() {
    if (!canSend) return
    chat.send(answer.slice(0, ANSWER_MAX))
    setPicked([])
    setText('')
  }

  const mic = (
    <button
      type="button"
      aria-label="Dicter"
      title={dictationAction.available ? 'Dicter' : undefined}
      aria-disabled={!chat.open || !dictationAction.available}
      onClick={() =>
        chat.open && dictationAction.available && dictation.start()
      }
      className={cn(
        'grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] text-muted-foreground hover:bg-foreground/[0.045]',
        (!chat.open || !dictationAction.available) &&
          'cursor-default opacity-40 hover:bg-transparent',
      )}
    >
      <Mic className="size-[15px]" />
    </button>
  )

  return (
    <div className="flex h-[470px] max-h-[calc(100dvh-10rem)] flex-col">
      {intention.trim() && (
        <div
          className={cn(
            'mx-[18px] mt-3.5 flex flex-col gap-0.5 rounded-[10px] bg-foreground/[0.025] px-3 py-2.5 transition-opacity duration-300',
            chat.waiting && 'opacity-50',
          )}
        >
          <span className="text-[11.5px] text-muted-foreground">Intention</span>
          <span className="text-sm leading-[1.4] font-semibold text-pretty">
            {intention}
          </span>
        </div>
      )}

      {/* `flex-col-reverse` : le fil reste collé en bas à chaque bulle. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-auto">
        <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
          {chat.messages.map((m, i) =>
            m.from === 'sophia' ? (
              <div
                key={i}
                className="max-w-[85%] self-start rounded-[12px_12px_12px_4px] bg-[#FDF7FA] px-3 py-[9px] text-[13.5px] leading-[1.45] text-pretty text-[#4C2337] dark:bg-[#d15796]/12 dark:text-[#f0d3e1]"
              >
                {m.text}
              </div>
            ) : (
              <div
                key={i}
                className="max-w-[80%] self-end rounded-[12px_12px_4px_12px] bg-foreground/[0.07] px-3 py-[9px] text-[13.5px] leading-[1.45] text-pretty whitespace-pre-wrap"
              >
                {m.text}
              </div>
            ),
          )}
          {chat.waiting && (
            <div
              role="status"
              aria-label="Sophia écrit"
              className="flex h-9 items-center self-start rounded-[12px_12px_12px_4px] bg-[#FDF7FA] px-3.5 dark:bg-[#d15796]/12"
            >
              <SophiaDots />
            </div>
          )}
          {chat.failed && (
            <ErrorLine
              message="Sophia n'a pas pu répondre."
              onRetry={chat.retry}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-[18px] pb-3.5">
        {chat.open && chat.suggestions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {chat.suggestions.map((s) => {
              const on = picked.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((p) =>
                      on ? p.filter((x) => x !== s) : [...p, s],
                    )
                  }
                  className={cn(
                    'inline-flex h-7 cursor-pointer items-center gap-[5px] rounded-full px-[11px] text-[12.5px] font-medium',
                    on
                      ? 'bg-foreground text-background'
                      : 'bg-background text-foreground/80 ring-1 ring-border ring-inset hover:ring-foreground/45',
                  )}
                >
                  {on && <Check className="size-[11px]" strokeWidth={3} />}
                  {s}
                </button>
              )
            })}
          </div>
        )}

        {dictation.step === 'recording' ? (
          <div className="flex items-center gap-2.5 rounded-[10px] py-[5px] pr-[5px] pl-3 ring-[1.5px] ring-foreground/35 ring-inset">
            <Levels levels={dictation.levels} />
            <span
              role="status"
              className="flex-1 text-[13.5px] text-foreground/70"
            >
              En écoute
            </span>
            <button
              type="button"
              onClick={dictation.stop}
              className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] bg-foreground px-2.5 text-[12.5px] font-medium text-background hover:bg-foreground/90"
            >
              <span
                aria-hidden
                className="size-2 rounded-[2px] bg-background"
              />
              Arrêter
            </button>
          </div>
        ) : dictation.step === 'cleaning' ? (
          <div
            role="status"
            className="flex h-10 items-center rounded-[10px] px-3 text-[13.5px] text-muted-foreground ring-1 ring-border ring-inset"
          >
            Nettoyage…
          </div>
        ) : (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-[10px] py-[5px] pr-[5px] pl-3 ring-1 ring-border ring-inset',
              text && 'ring-[1.5px] ring-foreground/35',
            )}
          >
            <input
              ref={field}
              value={text}
              aria-label="Ta réponse"
              disabled={!chat.open}
              maxLength={ANSWER_MAX}
              placeholder={
                chat.done ? "Sophia a ce qu'il lui faut" : 'Ta réponse…'
              }
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  send()
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70 disabled:cursor-default"
            />
            {dictationAction.available || !dictationAction.reason ? (
              mic
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>{mic}</TooltipTrigger>
                <TooltipContent className="max-w-72 text-pretty">
                  {dictationAction.reason}
                </TooltipContent>
              </Tooltip>
            )}
            <button
              type="button"
              aria-label="Envoyer"
              title="Envoyer"
              disabled={!canSend}
              onClick={send}
              className={cn(
                'grid size-[30px] shrink-0 place-items-center rounded-[7px]',
                canSend
                  ? 'cursor-pointer bg-foreground text-background hover:bg-foreground/90'
                  : 'bg-foreground/[0.045] text-muted-foreground/60',
              )}
            >
              <ArrowUp className="size-3.5" strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Le niveau du micro dans le champ : 5 barres foncées, les plus récentes
 *  (la maquette en dessine 5, de 18 px au plus). */
function Levels({ levels }: { levels: number[] }) {
  return (
    <span aria-hidden className="flex h-[18px] items-center gap-0.5">
      {levels.slice(-5).map((level, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[2px] bg-foreground transition-[height] duration-75"
          style={{ height: `${4 + Math.round(level * 14)}px` }}
        />
      ))}
    </span>
  )
}
