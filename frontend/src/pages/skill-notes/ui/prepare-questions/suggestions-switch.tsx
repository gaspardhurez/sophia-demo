import { cn } from '@/shared/lib/utils'
import { Switch, Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import { IDEA_LABEL, IDEA_SWITCH_ON } from './idea-styles'

/**
 * L'interrupteur **« 🧠 Suggestions »** de « Préparer les questions » (#173,
 * `prod/Notes`), à gauche de « Cacher les notes » : libellé et interrupteur
 * au rose des suggestions. Indisponible (pas de clé), il reste là, grisé,
 * son motif en infobulle — `aria-disabled` plutôt que `disabled`, pour que
 * le survol et le focus la montrent (décision du 29/10).
 */
export function SuggestionsSwitch({
  on,
  available,
  reason,
  onToggle,
}: {
  on: boolean
  available: boolean
  reason: string | null
  onToggle: () => void
}) {
  const button = (
    <button
      type="button"
      aria-disabled={!available || undefined}
      onClick={() => available && onToggle()}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-[12.5px] font-medium',
        IDEA_LABEL,
        !available && 'cursor-default opacity-40',
      )}
    >
      🧠 Suggestions
      <Switch on={on} onClassName={IDEA_SWITCH_ON} />
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
