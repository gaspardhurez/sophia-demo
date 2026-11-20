import { ShieldCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { Resource } from '@/entities/resource'
import type { PasteReason } from '@/entities/review'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import type { ReviewStep } from '../../model/use-review'
import { DismissButton, Notice, OUTLINED, RetryButton } from './notice'

/**
 * **Vérifier les notes**, à droite de Dicter dans une ressource ouverte
 * (`prod/Notes`) ; une fois des commentaires posés, **« Vérifier à
 * nouveau »** (décision du 29/10, au lieu de « Revérifier »).
 *
 * Indisponible (pas de clé) : visible, grisé, le motif en infobulle —
 * `aria-disabled` plutôt que `disabled`, pour que le survol et le focus
 * montrent l'infobulle (comme Dicter).
 */
export function ReviewButton({
  again,
  available,
  reason,
  onStart,
}: {
  again: boolean
  available: boolean
  reason: string | null
  onStart: () => void
}) {
  const button = (
    <button
      type="button"
      aria-disabled={!available}
      onClick={() => available && onStart()}
      className={cn(
        OUTLINED,
        !available && 'cursor-default opacity-40 hover:bg-card',
      )}
    >
      <ShieldCheck aria-hidden className="size-3.5" />
      {again ? 'Vérifier à nouveau' : 'Vérifier les notes'}
    </button>
  )
  if (available || !reason) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{reason}</TooltipContent>
    </Tooltip>
  )
}

/** La pastille de Sophia (`prod/Notes`, `kit` : `CHIP_TONES` rose). */
export function SophiaChip() {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-(--review-chip) px-2 text-xs font-semibold whitespace-nowrap text-(--review-text)">
      🧠 Sophia
    </span>
  )
}

/** Un encart de Sophia, en tête des notes (`prod/Notes`). */
function SophiaBox({
  children,
  column = false,
}: {
  children: ReactNode
  column?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-2 mb-2.5 flex gap-2 rounded-[10px] bg-(--review-soft) px-3.5 py-3',
        column ? 'flex-col gap-2.5' : 'items-center',
      )}
    >
      {children}
    </div>
  )
}

/** « , chapitre 6 » : la partie de la ressource, quand elle en a une. */
function partOf(resource: Resource): string {
  const part = resource.part?.trim()
  return part ? `, ${part}` : ''
}

/** Ce que Sophia dit quand elle n'a pas pu lire la source. */
function pasteText(reason: PasteReason, resource: Resource): string {
  const name = `« ${resource.title} »${partOf(resource)}`
  switch (reason) {
    case 'no_link':
      return `Je n'ai pas de lien vers ${name}.`
    case 'no_transcript':
      return `Je n'ai pas trouvé les sous-titres de ${name}.`
    case 'too_long':
      return `${name} est trop long pour que je le relise en entier : colle la partie étudiée.`
    default:
      return `Je n'ai pas accès à ${name}.`
  }
}

/**
 * Ce que la vérification montre **en tête des notes** (`prod/Notes`) :
 * - pendant la relecture : « 🧠 Sophia · Je relis la source, *partie*… » ;
 * - source illisible : pourquoi, le champ « Colle le passage », Annuler et
 *   Vérifier — **à ce moment-là seulement** ;
 * - rien relevé : « Rien d'important ne manque. » ;
 * - un échec : son message en rouge, « Réessayer » s'il a un recours, ✕.
 */
export function ReviewBanner({
  state,
  resource,
  onPaste,
  onCancel,
  onRetry,
  onDismiss,
}: {
  state: ReviewStep
  resource: Resource
  onPaste: (text: string) => void
  onCancel: () => void
  onRetry: () => void
  onDismiss: () => void
}) {
  switch (state.step) {
    case 'running':
      return (
        <SophiaBox>
          <SophiaChip />
          <span role="status" className="text-[13px] text-(--review-text)">
            {state.pasted
              ? 'Je relis le passage…'
              : `Je relis la source${partOf(resource)}…`}
          </span>
        </SophiaBox>
      )
    case 'paste':
      return (
        <PasteBox
          text={pasteText(state.reason, resource)}
          error={state.error}
          draft={state.draft}
          onPaste={onPaste}
          onCancel={onCancel}
        />
      )
    case 'nothing':
      return (
        <SophiaBox>
          <SophiaChip />
          <span role="status" className="text-[13px] text-(--review-text)">
            Rien d'important ne manque.
          </span>
        </SophiaBox>
      )
    case 'failed':
      return (
        <div className="mb-2.5">
          <Notice message={state.message}>
            {state.retry && <RetryButton onClick={onRetry} />}
            <DismissButton onClick={onDismiss} />
          </Notice>
        </div>
      )
    default:
      return null
  }
}

/** Le champ « Colle le passage » (`prod/Notes`, « Vérifier : source
 *  illisible ») ; ⌘Entrée vérifie, Échap annule. */
function PasteBox({
  text,
  error,
  draft,
  onPaste,
  onCancel,
}: {
  text: string
  error: string | null
  /** Le passage refusé (trop long), rendu pour être raccourci. */
  draft: string
  onPaste: (text: string) => void
  onCancel: () => void
}) {
  const [pasted, setPasted] = useState(draft)
  const empty = !pasted.trim()
  return (
    <SophiaBox column>
      <div className="flex flex-wrap items-center gap-2">
        <SophiaChip />
        <span className="text-[13px] text-pretty text-(--review-text)">
          {text}
        </span>
      </div>
      <textarea
        rows={4}
        // Le champ n'apparaît qu'à la demande : on y colle tout de suite.
        autoFocus
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !empty)
            onPaste(pasted)
        }}
        placeholder="Colle le passage"
        aria-label="Colle le passage"
        className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-[13.5px] leading-normal text-foreground outline-none placeholder:text-muted-foreground/70"
      />
      {error && (
        <span role="alert" className="text-[13px] text-destructive">
          {error}
        </span>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-[30px] items-center rounded-[7px] px-3 text-[13px] font-medium text-(--review-text) hover:bg-(--review-chip)"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() => onPaste(pasted)}
          className="inline-flex h-[30px] items-center rounded-[7px] bg-foreground px-3 text-[13px] font-medium text-background disabled:opacity-40"
        >
          Vérifier
        </button>
      </div>
    </SophiaBox>
  )
}
