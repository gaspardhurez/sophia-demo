import { useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui'

import { useFramingCompanion } from '../model/companion'
import type { IntentionChat as IntentionChatState } from '../model/use-intention-chat'
import { IntentionChat } from './intention-chat'
import { Footer, UnavailableNote } from './parts'

/** La borne du serveur sur l'Intention (`target_level`, `string(200)`). */
const MAX = 200

/**
 * 1 · Intention (#175, `prod/Cadrer etude - Intention`) : deux écrans.
 *
 * - **Écrire** : avec le compagnon, le chat (`IntentionChat` — Sophia pose
 *   ses questions, l'encadré « Intention » se met à jour) ; sans lui, la
 *   ligne grisée « Questions de Sophia indisponibles » et le champ
 *   « Intention », pré-rempli de l'intention existante à la relance.
 *   Pied : Passer (rien ne s'écrit), Suivant (grisé tant qu'il n'y a pas
 *   d'intention — dans le chat, avant la première réponse, sauf à la
 *   relance ; Entrée aussi dans le champ).
 * - **Formuler** : l'intention seule, en grand. Reformuler ouvre le texte
 *   pour le retoucher (pas de nouvel appel) ; Formuler l'intention l'écrit
 *   (`target_level`) et passe au périmètre ; Retour revient à l'écriture.
 */
export function IntentionStep({
  skillId,
  chat,
  screen,
  draft,
  onDraft,
  onScreen,
  onPass,
  onFormulate,
}: {
  skillId: string
  /** Le chat de Sophia ; nul sans compagnon (le champ, à la main). */
  chat: IntentionChatState | null
  screen: 'write' | 'form'
  draft: string
  onDraft: (text: string) => void
  onScreen: (screen: 'write' | 'form') => void
  onPass: () => void
  onFormulate: () => void
}) {
  const companion = useFramingCompanion('intention')
  const [editing, setEditing] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const filled = draft.trim().length > 0

  if (screen === 'form')
    return (
      <>
        <div className="flex h-[470px] max-h-[calc(100dvh-10rem)] flex-col justify-center gap-2 px-7">
          <span className="text-xs text-muted-foreground">Intention</span>
          <textarea
            aria-label="Intention"
            value={draft}
            maxLength={MAX}
            readOnly={!editing}
            ref={field}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (filled) onFormulate()
              }
            }}
            className={cn(
              '-mx-1.5 -my-1 resize-none rounded-md bg-transparent px-1.5 py-1 font-heading text-[22px] leading-[1.35] font-semibold tracking-[-0.015em] text-pretty outline-none [field-sizing:content] read-only:cursor-default',
              editing && 'ring-[1.5px] ring-foreground/35 ring-inset',
            )}
          />
        </div>
        <Footer
          start={
            <Button
              variant="ghost"
              size="sm"
              className="text-[13px] font-medium text-foreground/70"
              onClick={() => {
                setEditing(false)
                onScreen('write')
              }}
            >
              Retour
            </Button>
          }
        >
          <Button
            variant="outline"
            size="sm"
            aria-pressed={editing}
            className="text-[13px] font-medium aria-pressed:bg-muted"
            onClick={() => {
              // Le texte s'ouvre, le curseur en fin : on retouche tout de suite.
              setEditing(true)
              const el = field.current
              el?.focus()
              el?.setSelectionRange(el.value.length, el.value.length)
            }}
          >
            Reformuler
          </Button>
          <Button
            size="sm"
            disabled={!filled}
            className="text-[13px] font-medium"
            onClick={onFormulate}
          >
            Formuler l'intention
          </Button>
        </Footer>
      </>
    )

  return (
    <>
      {chat ? (
        <IntentionChat chat={chat} skillId={skillId} intention={draft} />
      ) : (
        <div className="flex h-[470px] max-h-[calc(100dvh-10rem)] flex-col gap-4 p-[18px]">
          <UnavailableNote
            label="Questions de Sophia indisponibles"
            reason={companion.reason}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Intention</span>
            <input
              value={draft}
              maxLength={MAX}
              autoFocus
              placeholder="Ce que tu veux de ce cycle…"
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filled) {
                  e.preventDefault()
                  onScreen('form')
                }
              }}
              className="h-10 w-full rounded-lg bg-transparent px-2.5 text-sm text-foreground ring-1 ring-border outline-none ring-inset placeholder:text-muted-foreground/70 focus:ring-[1.5px] focus:ring-foreground/35"
            />
          </label>
        </div>
      )}
      <Footer>
        <Button
          variant="ghost"
          size="sm"
          className="text-[13px] font-medium text-foreground/70"
          onClick={onPass}
        >
          Passer
        </Button>
        <Button
          size="sm"
          disabled={!filled}
          className="text-[13px] font-medium"
          onClick={() => onScreen('form')}
        >
          Suivant
        </Button>
      </Footer>
    </>
  )
}
