import type { JSONContent } from '@tiptap/core'
import { useEffect, useMemo, useRef } from 'react'

import type { Notes } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import { outlineEntries } from '../../lib/outline-entries'
import { toEditorDoc } from '../../model/document'
import { goToHeading, useOutline } from '../../model/use-outline'
import { ROW_HOVER, ROW_SELECTED } from './styles'

/** Le retrait d'un titre : 36 px au premier niveau (sous l'emoji de
 *  « Notes »), puis 12 px par niveau. */
const INDENT: Record<number, string> = {
  1: 'pl-9',
  2: 'pl-12',
  3: 'pl-15',
}

/** Combien d'images attendre l'éditeur après être revenu aux notes. */
const WAIT_FRAMES = 60

/** Les titres de premier rang de l'éditeur des notes, dans l'ordre. */
function editorHeadings(): HTMLElement[] {
  const doc = document.querySelector('[data-notes-doc]')
  return doc
    ? Array.from(
        doc.querySelectorAll<HTMLElement>(
          ':scope > h1, :scope > h2, :scope > h3',
        ),
      )
    : []
}

/**
 * « 📓 Notes » et le sommaire, en tête de la colonne (#173, `prod/Notes`).
 *
 * - **📓 Notes** ramène aux notes du savoir ; il est sur fond choisi tant
 *   que les notes sont la vue.
 * - **Le sommaire** : un titre par ligne (`outlineEntries` — les titres de
 *   premier rang, en retrait par niveau), avec à droite le nombre de
 *   questions qu'il range (un « ? » gris, puis le nombre ; rien à zéro). Un
 *   clic mène au titre — depuis une autre vue, on revient d'abord aux
 *   notes ; le titre s'arrête sous le haut et se surligne brièvement. Le
 *   titre qu'on lit est à l'encre des notes.
 *
 * Un titre replié sous un titre dépliant n'est pas dans la page : un clic
 * sur lui ne fait rien.
 */
export function ColumnOutline({
  notes,
  active,
  onNotes,
}: {
  notes: Notes
  /** Les notes sont la vue affichée. */
  active: boolean
  onNotes: () => void
}) {
  const entries = useMemo(
    () => outlineEntries(toEditorDoc(notes) as JSONContent),
    [notes],
  )
  const titles = () => {
    const all = editorHeadings()
    return entries.flatMap((e) => (all[e.ordinal] ? [all[e.ordinal]] : []))
  }
  const current = useOutline(
    titles,
    `${active}:${entries.map((e) => e.ordinal).join(',')}`,
  )

  // Un titre choisi depuis une autre vue : on le rejoint une fois l'éditeur
  // monté.
  const pending = useRef<number | null>(null)
  useEffect(() => {
    if (!active || pending.current === null) return
    const ordinal = pending.current
    let frames = 0
    let frame = requestAnimationFrame(function wait() {
      const el = editorHeadings()[ordinal]
      if (el || ++frames > WAIT_FRAMES) {
        pending.current = null
        if (el?.offsetParent) goToHeading(el)
        return
      }
      frame = requestAnimationFrame(wait)
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  function pick(ordinal: number) {
    if (active) {
      const el = editorHeadings()[ordinal]
      if (el?.offsetParent) goToHeading(el)
      return
    }
    pending.current = ordinal
    onNotes()
  }

  return (
    <div className="flex flex-col gap-px">
      <button
        type="button"
        onClick={onNotes}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-[30px] cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold',
          active ? ROW_SELECTED : ROW_HOVER,
        )}
      >
        <span aria-hidden className="w-5 text-center">
          📓
        </span>
        Notes
      </button>
      {entries.map((e, i) => {
        const reading = active && i === current
        return (
          <button
            key={e.key}
            type="button"
            onClick={() => pick(e.ordinal)}
            aria-current={reading ? 'location' : undefined}
            className={cn(
              'flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md pr-2 text-left text-[13px] hover:text-foreground',
              ROW_HOVER,
              INDENT[e.level] ?? INDENT[3],
              reading ? 'text-(--note-accent)' : 'text-foreground/75',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{e.title}</span>
            {e.count > 0 && (
              <span
                aria-label={`${e.count} question${e.count > 1 ? 's' : ''}`}
                className="inline-flex shrink-0 items-center gap-[3px] text-[11.5px] text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="grid size-[13px] place-items-center rounded-full bg-foreground/20 text-[8.5px] font-bold text-background"
                >
                  ?
                </span>
                <span aria-hidden>{e.count}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
