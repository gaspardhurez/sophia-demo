import { Link, type To } from 'react-router-dom'

import { notesOutline } from '../lib/outline'
import { notesBlank } from '../lib/summary'
import type { Notes } from '../model/types'
import { cn } from '@/shared/lib/utils'

const DASH = 'rounded-[2px] border border-dashed'

/**
 * Les notes d'un savoir en miniature lisible (#160, `kit/Feuille notes`) : la
 * carte est la page — 📓 et le nom du savoir, puis les parties et le début de
 * leur texte, estompés vers le bas et coupés par la hauteur ; une partie sans
 * titre, son paragraphe seul. Vides (ou pas encore chargées) : trois traits
 * pointillés et « Écrire les notes ». Un clic l'ouvre.
 */
export function NotesThumbnail({
  name,
  to,
  notes,
  height = 210,
}: {
  name: string
  to: To
  notes: Notes | undefined
  height?: number
}) {
  const parts = notes && !notesBlank(notes) ? notesOutline(notes.doc) : []
  return (
    <Link
      to={to}
      aria-label={`Notes · ${name}`}
      style={{ height }}
      className="flex flex-col gap-1.5 overflow-hidden rounded-xl border bg-card px-5 py-[18px] text-card-foreground shadow-[0_1px_3px_oklch(0.21_0.008_285/0.08)] transition-shadow hover:shadow-[0_4px_14px_-2px_oklch(0.21_0.008_285/0.16)]"
    >
      <span className="flex shrink-0 items-start gap-1.5 text-[13px] leading-[1.35] font-semibold">
        <span aria-hidden className="text-sm leading-[18px]">
          📓
        </span>
        <span>{name}</span>
      </span>
      {parts.length > 0 ? (
        <span
          aria-hidden
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden [mask-image:linear-gradient(#000_65%,transparent)]"
        >
          {parts.map((p, i) => (
            <span key={i} className="contents">
              {p.title && (
                <span className="mt-1 text-[10.5px] font-semibold">
                  {p.title}
                </span>
              )}
              {p.text && (
                <span className="text-[10px] leading-normal text-foreground/70">
                  {p.text}
                </span>
              )}
            </span>
          ))}
        </span>
      ) : (
        <span className="flex flex-1 flex-col gap-2 pt-1.5">
          <span
            aria-hidden
            className={cn(DASH, 'h-[5px] w-[60%] border-muted-foreground/40')}
          />
          <span
            aria-hidden
            className={cn(DASH, 'h-1 w-[90%] border-muted-foreground/30')}
          />
          <span
            aria-hidden
            className={cn(DASH, 'h-1 w-[75%] border-muted-foreground/30')}
          />
          <span className="mt-auto text-xs font-medium text-foreground/70">
            Écrire les notes
          </span>
        </span>
      )}
    </Link>
  )
}
