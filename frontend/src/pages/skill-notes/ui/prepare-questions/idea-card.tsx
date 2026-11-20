import type { CentralIdea } from '@/entities/companion'
import { cn } from '@/shared/lib/utils'

import type { SectionIdeas } from '../../model/use-section-ideas'
import {
  IDEA_CARD,
  IDEA_DISMISS,
  IDEA_LABEL,
  IDEA_TEXT,
  IDEA_WRITE,
} from './idea-styles'

/**
 * Une idée centrale proposée par Sophia (#173, `prod/Notes`, « Préparer les
 * questions », interrupteur « 🧠 Suggestions ») : une carte pointillée rose,
 * sous les questions de sa partie, avant « + Question ».
 *
 * - `side` (notes en face) : « 🧠 » et la raison (12 px, gras), l'angle
 *   (13 px), puis **Écrire la question** et **Pas besoin**. Son survol
 *   surligne son passage dans les notes, en rose (`onHover`).
 * - `list` (notes cachées) : « 🧠 » dans la marge des ronds, l'idée
 *   (14 px) et l'angle dessous (12,5 px), **Écrire la question** à droite —
 *   pas de « Pas besoin », comme la maquette.
 *
 * L'idée elle-même n'est écrite qu'en liste : en face des notes, c'est son
 * passage surligné qui la montre.
 */
export function IdeaCard({
  idea,
  variant,
  busy,
  onWrite,
  onDismiss,
  onHover,
}: {
  idea: CentralIdea
  variant: 'side' | 'list'
  /** Une question est en train de se poser : « Écrire » attend. */
  busy: boolean
  onWrite: () => void
  onDismiss: () => void
  onHover?: (on: boolean) => void
}) {
  if (variant === 'list')
    return (
      <div
        className={cn(
          IDEA_CARD,
          IDEA_TEXT,
          'flex items-center gap-3 px-3 py-2.5',
        )}
      >
        <span aria-hidden className="w-[22px] shrink-0 text-center text-xs">
          🧠
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm font-medium text-pretty">{idea.idea}</span>
          <span className={cn('text-[12.5px] text-pretty', IDEA_LABEL)}>
            {idea.angle}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onWrite}
          className={cn(IDEA_WRITE, 'h-7 shrink-0 rounded-[7px] px-2.5')}
        >
          Écrire la question
        </button>
      </div>
    )
  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(IDEA_CARD, IDEA_TEXT, 'flex flex-col gap-1 px-3 py-2.5')}
    >
      <span className={cn('text-xs font-semibold text-pretty', IDEA_LABEL)}>
        🧠 {idea.reason}
      </span>
      <span className="text-[13px] leading-[1.45] text-pretty">
        {idea.angle}
      </span>
      <div className="mt-0.5 flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onWrite}
          className={cn(IDEA_WRITE, 'h-[26px] px-[9px]')}
        >
          Écrire la question
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className={cn(IDEA_DISMISS, 'h-[26px] px-2')}
        >
          Pas besoin
        </button>
      </div>
    </div>
  )
}

/**
 * Ce que disent les suggestions d'une section tant qu'elles ne sont pas là :
 * « Sophia lit la section… » pendant la demande ; l'échec en rouge, avec
 * **Réessayer** quand redemander a un sens. Rendues sans idée : rien (la
 * maquette ne montre rien sous une section sans suggestion).
 */
export function IdeasNotice({
  ideas,
  onRetry,
}: {
  ideas: SectionIdeas | undefined
  onRetry: () => void
}) {
  if (ideas?.state === 'loading')
    return (
      <span
        role="status"
        className={cn('animate-pulse px-0.5 text-[12.5px]', IDEA_LABEL)}
      >
        🧠 Sophia lit la section…
      </span>
    )
  if (ideas?.state === 'failed')
    return (
      <span
        role="alert"
        className="flex flex-wrap items-center gap-x-2 px-0.5 text-[12.5px] text-destructive"
      >
        {ideas.failure.message}
        {ideas.failure.retry && (
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer font-medium underline underline-offset-2"
          >
            Réessayer
          </button>
        )}
      </span>
    )
  return null
}
