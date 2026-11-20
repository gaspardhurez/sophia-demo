import 'katex/dist/katex.min.css'

import { Selection } from '@tiptap/pm/state'
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import katex from 'katex'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui'

/** Le LaTeX rendu par KaTeX, ou l'erreur qui l'en empêche. */
function render(latex: string, display: boolean) {
  try {
    return {
      html: katex.renderToString(latex, {
        displayMode: display,
        throwOnError: true,
      }),
      error: null,
    }
  } catch (e) {
    return {
      html: null,
      error:
        e instanceof Error
          ? e.message.replace(/^KaTeX parse error: /, '')
          : String(e),
    }
  }
}

/**
 * Une équation (KaTeX), en bloc entier — centrée, en mode display — ou dans
 * le texte. Un clic ouvre son champ LaTeX dans une bulle ; l'équation s'y
 * prévisualise à mesure. Entrée (⇧Entrée : un saut de ligne, en bloc) ou un
 * clic dehors valide, Échap annule. Un LaTeX invalide ne casse rien : la
 * source s'affiche en rouge, l'erreur sous le champ. Une équation neuve (vide
 * et sélectionnée) s'ouvre d'elle-même ; une équation en ligne laissée vide
 * disparaît.
 */
export function MathView({ node, editor, getPos, selected }: NodeViewProps) {
  const display = node.type.name === 'blockMath'
  const latex = node.attrs.latex as string
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(latex)
  const field = useRef<HTMLTextAreaElement>(null)

  const open = () => {
    if (!editor.isEditable) return
    setDraft(latex)
    setEditing(true)
  }

  // Neuve : vide et sélectionnée (le menu « / » vient de la poser).
  useEffect(() => {
    if (selected && !latex && !editing) open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  /**
   * Fermer en écrivant `value` (ou l'ancien LaTeX : annuler). `leave` : le
   * curseur passe juste après l'équation ; sinon (un clic dehors) il va où
   * l'on a cliqué.
   */
  const close = (value: string, leave: boolean) => {
    setEditing(false)
    const pos = getPos()
    if (pos === undefined) return
    const remove = !display && !value.trim()
    // Le champ rend le focus, sinon l'éditeur ne le reprend pas (la bulle
    // reste montée le temps de sa sortie).
    if (leave && document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    editor
      .chain()
      .command(({ tr }) => {
        if (remove) tr.delete(pos, pos + node.nodeSize)
        else if (value !== latex)
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: value })
        if (leave)
          tr.setSelection(
            Selection.near(tr.doc.resolve(remove ? pos : pos + node.nodeSize)),
          )
        return true
      })
      .run()
    // Tout de suite (pas au cadre suivant, comme `focus()` de TipTap) : la
    // frappe qui suit va à l'éditeur.
    if (leave) editor.view.focus()
  }

  const shown = editing ? draft : latex
  const out = useMemo(() => render(shown, display), [shown, display])
  const empty = !shown.trim()

  const face = empty ? (
    <span
      className={cn(
        'text-muted-foreground',
        display ? 'text-[14px]' : 'text-[0.9em]',
      )}
    >
      <span className="font-serif italic">√x</span>
      {display && ' Ajouter une équation TeX'}
    </span>
  ) : out.html ? (
    <span dangerouslySetInnerHTML={{ __html: out.html }} />
  ) : (
    <span className="font-mono text-[0.85em] text-destructive">{shown}</span>
  )

  return (
    <NodeViewWrapper
      as={display ? 'div' : 'span'}
      contentEditable={false}
      className={display ? 'my-0.5' : undefined}
    >
      <Popover
        open={editing}
        onOpenChange={(next) => (next ? open() : close(draft, false))}
      >
        <PopoverTrigger asChild>
          <span
            data-math={display ? 'block' : 'inline'}
            // Ouvert au relâchement : ProseMirror, qui sélectionne le nœud au
            // clic, peut en refaire le DOM entre l'appui et le clic (en ligne).
            // Le clic ne bascule donc rien.
            onMouseUp={(e) => {
              if (e.button === 0 && !editing) open()
            }}
            onClick={(e) => e.preventDefault()}
            className={cn(
              'cursor-pointer transition-colors duration-100',
              display
                ? 'flex justify-center overflow-x-auto rounded-md px-2 py-1.5 hover:bg-muted/60 [&_.katex-display]:m-0'
                : 'rounded-[4px] px-0.5 hover:bg-muted',
              (selected || editing) &&
                'bg-(--note-accent)/10 hover:bg-(--note-accent)/10',
            )}
          >
            {face}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="flex w-[360px] flex-col gap-2 p-2"
          // Au cadre suivant : ProseMirror, au relâchement du clic qui ouvre,
          // reprend le focus.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            requestAnimationFrame(() => field.current?.focus())
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            close(latex, true)
          }}
        >
          <textarea
            ref={field}
            aria-label="LaTeX"
            value={draft}
            rows={display ? 3 : 1}
            spellCheck={false}
            placeholder={display ? 'E = mc^2' : 'x^2'}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              const end = e.currentTarget.value.length
              e.currentTarget.setSelectionRange(end, end)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !(display && e.shiftKey)) {
                e.preventDefault()
                close(draft, true)
              }
            }}
            className="w-full resize-none rounded-md border bg-background px-2 py-1.5 font-mono text-[13px] leading-[1.5] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <div className="flex items-center gap-2">
            <span
              role="status"
              className="min-w-0 flex-1 truncate text-[12px] text-destructive"
              title={out.error ?? undefined}
            >
              {!empty && out.error}
            </span>
            <button
              type="button"
              onClick={() => close(draft, true)}
              className="shrink-0 cursor-pointer rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Terminé ↵
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  )
}
