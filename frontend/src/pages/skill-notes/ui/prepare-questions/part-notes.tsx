import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'

import { NOTE_PROSE } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import { editorExtensions } from '../../lib/editor-extensions'
import { posOfPath } from '../../lib/question-sections'
import { AnnotationMargin } from '../annotation-margin'
import { nodeViews } from '../node-views'

/** Le passage surligné déborde du texte de 6 px de chaque côté. */
const BLEED = 6

/**
 * Les notes d'une partie, à gauche de ses questions (#173, `prod/Notes`,
 * « Préparer les questions ») : le texte du document tel quel — mêmes blocs,
 * même dessin que l'éditeur, en lecture —, en 14,5 px et serré (5 px autour
 * d'un paragraphe). On n'y écrit pas : les notes s'écrivent dans les notes.
 *
 * `passage` : le bloc à surligner (survol d'une question), au fond accent
 * des notes à 14 % — le surlignage des titres et des questions. Il est
 * dessiné sous le texte, pas dans le document : rien ne touche à l'éditeur.
 * Celui d'une idée centrale (`tone="idea"`, survol de sa carte) prend le
 * rose des suggestions, le rose de la palette des notes à 14 % (`prod/Notes`
 * : rose sous une idée, bleuté sous une question).
 */
export function PartNotes({
  blocks,
  passage,
  tone = 'question',
}: {
  blocks: JSONContent[]
  passage: number[] | null
  tone?: 'question' | 'idea'
}) {
  // Options figées une fois (cf. `NotesEditor`) ; une partie qui change de
  // contenu est remontée par sa clé.
  const [options] = useState(() => ({
    extensions: editorExtensions(nodeViews({ questions: false })),
    content: { type: 'doc', content: blocks },
    editable: false,
    editorProps: {
      attributes: {
        class: cn(NOTE_PROSE, 'px-0 text-[14.5px] outline-none [&_p]:py-[5px]'),
      },
    },
  }))
  const editor = useEditor(options, [])

  const box = useRef<HTMLDivElement>(null)
  // Le surlignage garde sa dernière place en s'effaçant (le fondu) ; il ne
  // se montre que sur le passage qu'il a mesuré.
  const [mark, setMark] = useState<{
    of: string
    style: { top: number; left: number; width: number; height: number }
  } | null>(null)
  const key = passage?.join('.') ?? null
  useLayoutEffect(() => {
    if (!editor || !passage || !box.current) return
    const pos = posOfPath(editor.state.doc, passage)
    const dom = pos === null ? null : editor.view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return
    const outer = box.current.getBoundingClientRect()
    const rect = dom.getBoundingClientRect()
    setMark({
      of: passage.join('.'),
      style: {
        top: rect.top - outer.top,
        left: rect.left - outer.left - BLEED,
        width: rect.width + 2 * BLEED,
        height: rect.height,
      },
    })
  }, [editor, passage])

  return (
    <div ref={box} className="relative">
      {/* Sous le texte : un bloc positionné qui le précède se peint avant
          l'éditeur, positionné lui aussi. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute rounded-md transition-opacity duration-150',
          tone === 'idea'
            ? 'bg-(--note-text-pink)/14'
            : 'bg-(--note-accent)/14',
          key && mark?.of === key ? 'opacity-100' : 'opacity-0',
        )}
        style={mark?.style}
      />
      {editor && <EditorContent editor={editor} className="relative" />}
      {/* Les exemples, comme dans les notes (#211) : ils aident à écrire des
          questions élaboratives. La colonne des questions à droite. */}
      {editor && (
        <AnnotationMargin editor={editor} area={box} narrow questions={false} />
      )}
    </div>
  )
}
