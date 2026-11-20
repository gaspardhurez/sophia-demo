import { EditorContent, useEditor } from '@tiptap/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { NOTE_PROSE, type Notes, notesBlank } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import { editorExtensions } from '../lib/editor-extensions'
import { useDictationIn } from '../model/dictation-context'
import { questionsIn } from '../lib/question-anchors'
import { questionPos, toEditorDoc } from '../model/document'
import { QuestionsContext } from '../model/questions-context'
import { type SaveStatus, useAutosave } from '../model/use-autosave'
import { useStatusShown } from '../model/use-status-shown'
import { useQuestionActions } from '../model/use-question-actions'
import { BlockHandle } from './block-handle'
import { CodeLanguage } from './code-language'
import { ColumnResize } from './column-resize'
import { EmojiMenu } from './emoji-menu'
import { AnnotationMargin } from './annotation-margin'
import { LinkHover } from './link-hover'
import { Marquee } from './marquee'
import { MentionMenu } from './mention-menu'
import { nodeViews } from './node-views'
import { DictationStrip } from './resource-view/dictation-controls'
import { SelectionBar } from './selection-bar'
import { SlashMenu } from './slash-menu'

const STATUS: Record<SaveStatus, string> = {
  saved: 'Enregistré',
  pending: 'Enregistrement…',
  saving: 'Enregistrement…',
  error: "Échec de l'enregistrement",
}

/**
 * Les notes d'un savoir (design #88, `prod/Notes`) : une seule page, toujours
 * éditable. En haut, le fil et l'état d'enregistrement (autour d'une
 * modification seulement) ; la feuille — l'en-tête (`header` : 📓, le nom
 * du savoir, son cycle), puis le document : un seul, ses titres (H1 à H3) en
 * simple mise en forme, ses blocs, ses questions à leur place. Le sommaire
 * vit dans la colonne de la page (#173), qui retrouve les titres par
 * `data-notes-doc`. Tout s'enregistre au fil de la saisie.
 *
 * `notes` est lu en direct : l'éditeur part de son état initial, puis n'en
 * suit que le contenu des questions. `focus` : la question où défiler à
 * l'ouverture (`?question=<id>`), mise brièvement en évidence.
 *
 * La dictée de la page (#173) écrit au curseur de ces notes quand c'est
 * lui qu'on a eu en dernier (`useDictationIn`) ; son état se lit sous le
 * document (`DictationStrip`), le bouton est dans la colonne.
 */
export function NotesEditor({
  skillId,
  header,
  notes,
  crumbs,
  focus,
}: {
  skillId: string
  header: ReactNode
  notes: Notes
  crumbs: ReactNode
  focus: string | null
}) {
  // Options figées une fois : sans tableau de dépendances, `useEditor`
  // réapplique ses options dès que l'une change d'identité, et chaque
  // réapplication relance un rendu — une boucle.
  const [options] = useState(() => ({
    extensions: editorExtensions(nodeViews()),
    content: toEditorDoc(notes),
    // Page vide : on écrit tout de suite.
    autofocus: notesBlank(notes) ? ('start' as const) : false,
    editorProps: {
      attributes: {
        // Le sommaire de la colonne y cherche ses titres.
        'data-notes-doc': '',
        class: cn(
          NOTE_PROSE,
          'outline-none',
          // Textes d'invite des blocs vides (cf. `editorExtensions`) : à
          // ~30 % du texte, seulement quand l'éditeur a le focus (Notion).
          '[&.ProseMirror-focused_.is-empty]:before:pointer-events-none [&.ProseMirror-focused_.is-empty]:before:float-left [&.ProseMirror-focused_.is-empty]:before:h-0 [&.ProseMirror-focused_.is-empty]:before:text-foreground/30 [&.ProseMirror-focused_.is-empty]:before:content-[attr(data-placeholder)]',
        ),
      },
    },
  }))
  const editor = useEditor(options, [])

  const autosave = useAutosave(editor, skillId)
  const questions = useQuestionActions({ editor, skillId, notes })
  const status: SaveStatus =
    autosave.status === 'error' || questions.status === 'error'
      ? 'error'
      : autosave.status !== 'saved'
        ? autosave.status
        : questions.status
  const statusShown = useStatusShown(status)

  // `?question=<id>` : on défile jusqu'au bloc de son passage, une fois ; la
  // marge ouvre sa bulle, épinglée (`AnnotationMargin`, `open`).
  const focused = useRef(false)
  useEffect(() => {
    if (!editor || !focus || focused.current) return
    // Une annotation, ou un encadré dans le texte.
    const block =
      questionsIn(editor.state.doc).find((q) => q.id === focus)?.block ??
      questionPos(editor.state.doc, focus)
    if (block === null || block === undefined) return
    // Après le rendu. Marqué fait dans le cadre même : un effet annulé avant
    // (StrictMode, éditeur recréé) se rejoue.
    const frame = requestAnimationFrame(() => {
      focused.current = true
      const dom = editor.view.nodeDOM(block)
      if (!(dom instanceof HTMLElement)) return
      dom.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, focus])

  const area = useRef<HTMLDivElement>(null)
  const { dictation, here } = useDictationIn(editor, null)

  if (!editor) return null
  return (
    <QuestionsContext.Provider value={questions.state}>
      {/* Le fil sur la colonne des notes : aligné sur le texte (96 px de marge
          + les 8 px de padding des blocs). */}
      <div className="mx-auto flex h-11 w-full max-w-[912px] items-center gap-2.5 px-26 text-[13px] text-muted-foreground max-[700px]:px-6">
        {crumbs}
        <span
          role="status"
          className={cn(
            'ml-auto shrink-0 text-xs transition-opacity duration-300',
            !statusShown && 'opacity-0',
            status === 'error' && 'text-destructive',
          )}
        >
          {STATUS[status]}
        </span>
      </div>
      <div className="relative">
        {/* La colonne de Notion : 720 px centrés, 96 px de marge au moins
            (les poignées y vivent), 30vh d'air sous le texte. L'en-tête
            prend toute la largeur du texte, 30 px au-dessus des notes. */}
        <div
          ref={area}
          className="relative mx-auto flex w-full max-w-[912px] flex-col px-24 pt-8 pb-[30vh] selection:bg-(--note-accent)/28 max-[700px]:px-4"
        >
          {header}
          <EditorContent editor={editor} className="mt-[30px]" />
          {here && dictation && (
            <DictationStrip
              state={dictation.state}
              levels={dictation.levels}
              onUndo={dictation.undo}
              onRetry={dictation.retry}
              onDismiss={dictation.dismiss}
            />
          )}
          <ColumnResize editor={editor} area={area} />
          <CodeLanguage editor={editor} area={area} />
          <AnnotationMargin editor={editor} area={area} open={focus} />
          <Marquee editor={editor} area={area} />
          <BlockHandle
            editor={editor}
            area={area}
            onDeleteQuestion={(id) => void questions.remove(id)}
          />
          <SlashMenu editor={editor} area={area} questions />
          <EmojiMenu editor={editor} area={area} />
          <MentionMenu editor={editor} area={area} skillId={skillId} />
          <LinkHover editor={editor} area={area} />
          <SelectionBar editor={editor} area={area} />
        </div>
      </div>
    </QuestionsContext.Provider>
  )
}
