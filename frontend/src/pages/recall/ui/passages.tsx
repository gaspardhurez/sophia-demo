import { cn } from '@/shared/lib/utils'

/** Un échec : un ✕ rouge pâle (le même rond que sur la carte et au bilan). */
export const MISSED_DOT =
  'border-[1.5px] border-red-300 bg-red-50 text-red-600 dark:border-red-400/50 dark:bg-red-400/10 dark:text-red-400'

/**
 * La rangée des passages d'une question (#103), dès le 2ᵉ : un rond de 18
 * px par échec (✕ rouge pâle), puis ○ pour celui qui se joue.
 */
export function Passages({
  failures,
  current = false,
}: {
  failures: number
  /** Un ○ pour le passage en cours. */
  current?: boolean
}) {
  return (
    <div
      className="flex justify-center gap-1"
      aria-label={`${failures} passage${failures > 1 ? 's' : ''} raté${failures > 1 ? 's' : ''}`}
    >
      {Array.from({ length: failures }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'grid size-[18px] place-items-center rounded-full text-[9.5px] leading-none font-bold',
            MISSED_DOT,
          )}
        >
          ✕
        </span>
      ))}
      {current && (
        <span
          aria-hidden
          className="size-[18px] rounded-full border-[1.5px] border-border"
        />
      )}
    </div>
  )
}
