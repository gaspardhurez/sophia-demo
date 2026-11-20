import { Mic } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import type { DictationStep } from '../../model/use-dictation'
import { DismissButton, Notice, OUTLINED, RetryButton } from './notice'

/**
 * Le bouton de la dictée, à droite de « Notes » dans une ressource ouverte
 * (`prod/Notes`) : **Dicter** (micro), puis pendant l'enregistrement
 * **Arrêter** (rouge plein, un carré blanc), puis « Nettoyage… » en gris le
 * temps que le serveur rende les puces.
 *
 * Indisponible (pas de clé, pas de transcription) : Dicter reste là, grisé,
 * le motif en infobulle — `aria-disabled` plutôt que `disabled`, pour que
 * le survol et le focus montrent l'infobulle.
 */
export function DictationButton({
  step,
  available,
  reason,
  onStart,
  onStop,
}: {
  step: DictationStep['step']
  available: boolean
  reason: string | null
  onStart: () => void
  onStop: () => void
}) {
  if (step === 'recording')
    return (
      <button
        type="button"
        onClick={onStop}
        className="inline-flex h-[30px] shrink-0 items-center gap-2 rounded-[7px] bg-destructive px-[11px] text-[13px] font-medium whitespace-nowrap text-white hover:bg-destructive/90"
      >
        <span aria-hidden className="size-2 rounded-[2px] bg-white" />
        Arrêter
      </button>
    )
  if (step === 'cleaning')
    return (
      <span
        role="status"
        className="inline-flex h-[30px] items-center text-[13px] text-muted-foreground"
      >
        Nettoyage…
      </span>
    )
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
      <Mic aria-hidden className="size-3.5" />
      Dicter
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

/** Le niveau du micro : 12 barres rouges de 3 px, de 4 à 22 px de haut. */
function Levels({ levels }: { levels: number[] }) {
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      {levels.map((level, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[2px] bg-destructive/80 transition-[height] duration-75"
          style={{ height: `${4 + Math.round(level * 18)}px` }}
        />
      ))}
    </span>
  )
}

/**
 * Ce que la dictée montre **sous les notes** (`prod/Notes`) :
 * - en enregistrement, le niveau du micro et « En écoute » ;
 * - les puces posées, « Annuler la dictée » (le temps du surlignage) ;
 * - rien entendu : « Rien entendu : le micro est coupé ? » et « Réessayer » ;
 * - un échec : son message, « Réessayer » s'il y a un recours, et ✕ pour
 *   le fermer (hors maquette : un message d'erreur ne doit pas rester).
 */
export function DictationStrip({
  state,
  levels,
  onUndo,
  onRetry,
  onDismiss,
}: {
  state: DictationStep
  levels: number[]
  onUndo: () => void
  onRetry: () => void
  onDismiss: () => void
}) {
  switch (state.step) {
    case 'recording':
      return (
        <div className="flex h-[26px] items-center gap-2.5 px-2">
          <Levels levels={levels} />
          <span role="status" className="text-[13px] text-muted-foreground">
            En écoute
          </span>
        </div>
      )
    case 'placed':
      return (
        <div className="px-2">
          <button
            type="button"
            onClick={onUndo}
            className="-ml-2 inline-flex h-[26px] items-center rounded-md px-2 text-[12.5px] font-medium text-foreground/70 hover:bg-foreground/[0.04]"
          >
            Annuler la dictée
          </button>
        </div>
      )
    case 'empty':
      return (
        <Notice message="Rien entendu : le micro est coupé ?">
          <RetryButton onClick={onRetry} />
        </Notice>
      )
    case 'failed':
      return (
        <Notice message={state.message}>
          {state.retry !== 'none' && <RetryButton onClick={onRetry} />}
          <DismissButton onClick={onDismiss} />
        </Notice>
      )
    default:
      return null
  }
}
