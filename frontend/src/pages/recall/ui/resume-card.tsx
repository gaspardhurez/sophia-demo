import { useEffect } from 'react'

import { cn } from '@/shared/lib/utils'

import { CARD } from './card-stack'

/**
 * La reprise (#103, 12b) : une passation laissée un autre jour s'ouvre sur
 * une carte d'accueil — « On reprend », la rangée ✓ ✓ ✓ ○ ○ (les sues, puis
 * ce qui reste), « Commencée hier », **Reprendre** (espace aussi), qui sort
 * comme un Su.
 */
export function ResumeCard({
  known,
  total,
  since,
  ink,
  onResume,
}: {
  known: number
  total: number
  /** « hier », « lundi », « le 3 oct. ». */
  since: string
  ink: string
  onResume: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      onResume()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResume])

  return (
    <div
      className={cn(
        CARD,
        'min-h-0 flex-1 items-center justify-center gap-2.5 text-center',
      )}
    >
      <span className="font-heading text-[22px] font-semibold tracking-[-0.02em]">
        On reprend
      </span>
      <div className="flex gap-[5px]" aria-label={`${known} sur ${total} sues`}>
        {Array.from({ length: total }, (_, i) =>
          i < known ? (
            <span
              key={i}
              aria-hidden
              className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
              style={{ background: ink }}
            >
              ✓
            </span>
          ) : (
            <span
              key={i}
              aria-hidden
              className="size-5 rounded-full border-[1.5px] border-border"
            />
          ),
        )}
      </div>
      <span className="text-[13px] text-muted-foreground">
        Commencée {since}
      </span>
      <button
        type="button"
        autoFocus
        onClick={onResume}
        className="mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-[18px] text-[13px] font-semibold text-background hover:opacity-90"
      >
        Reprendre
        <span className="text-[11px] opacity-60">espace</span>
      </button>
    </div>
  )
}
