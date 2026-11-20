import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { NOTE_PROSE } from '@/entities/note'
import {
  type Resource,
  type ResourceNotes,
  useSaveResourceNotes,
} from '@/entities/resource'
import { useReviewComments } from '@/entities/review'
import { useElementWidth } from '@/shared/lib/use-element-width'
import { cn } from '@/shared/lib/utils'

import {
  editorExtensions,
  refreshPlaceholders,
} from '../../lib/editor-extensions'
import { toEditorDoc } from '../../model/document'
import {
  SAVE_STATUS_LABEL,
  type SaveStatus,
  useDocAutosave,
} from '../../model/use-autosave'
import { useCompanionAction } from '../../model/use-companion-action'
import { useDictationIn } from '../../model/dictation-context'
import { useReview } from '../../model/use-review'
import { useReviewAnchors } from '../../model/use-review-anchors'
import { useStatusShown } from '../../model/use-status-shown'
import { BlockHandle } from '../block-handle'
import { CodeLanguage } from '../code-language'
import { ColumnResize } from '../column-resize'
import { EmojiMenu } from '../emoji-menu'
import { AnnotationMargin } from '../annotation-margin'
import { LinkHover } from '../link-hover'
import { Marquee } from '../marquee'
import { MentionMenu } from '../mention-menu'
import { nodeViews } from '../node-views'
import { SelectionBar } from '../selection-bar'
import { SlashMenu } from '../slash-menu'
import { DictationButton, DictationStrip } from './dictation-controls'
import { ResourceHeader } from './resource-header'
import { ResourcePart } from './resource-part'
import { ResourceScope } from './resource-scope'
import { ReviewBanner, ReviewButton } from './review-controls'
import { ReviewMargin, ReviewMarginHead } from './review-margin'

/**
 * La largeur sous laquelle la marge des commentaires ne tient plus à côté
 * des notes (96 px de gouttière, ~560 px de texte, 28 px d'écart, 320 px
 * de marge, 40 px de bord) : ses cartes passent alors sous les notes.
 */
const MARGIN_MIN_WIDTH = 1040

/**
 * La feuille d'une ressource ouverte (#173, `prod/Notes`) : en haut, le fil
 * et l'état d'enregistrement, comme sur les notes ; puis l'en-tête (tuile,
 * titre, ↗, ⋯, ✕), « Section(s) concernée(s) », le « Périmètre » qu'elle
 * couvre (`ResourceScope`, 30/10), un trait, et **ses notes libres**.
 *
 * Les notes de la ressource sont **l'éditeur des notes du savoir, sans les
 * questions** : mêmes blocs, mêmes menus (« / », « @ », sélection, poignée),
 * même enregistrement au fil de la saisie (`useDocAutosave`). Une
 * configuration allégée aurait fait deux façons d'écrire dans la même page ;
 * et la note d'une ressource est faite pour **rejoindre** les notes du savoir
 * (le glisser vers le sommaire, à venir) — même schéma, rien à convertir.
 * Seules les questions restent au savoir : sans `create` au contexte des
 * questions, ni « Question » à la sélection ni au menu du bloc.
 *
 * **Dicter** (#173, `prod/Notes`), à droite de « Notes » : la dictée de
 * la page (`useDictation`), qui écrit **au curseur** de ces notes — en gris
 * au fil de la parole, puis en puces nettoyées ; l'éditeur s'y annonce
 * (`useDictationIn`) et son état se lit sous les notes (`DictationStrip`).
 * Sans curseur posé dans ces notes, ou indisponible : grisé, le motif en
 * infobulle. Le « Dicter » de la colonne est le même.
 *
 * **Vérifier les notes** (#173, `prod/Notes`), à droite de Dicter, puis
 * « Vérifier à nouveau » : Sophia relit les notes contre la ressource
 * (`useReview`) ; l'état de la relecture se lit en tête des notes
 * (`ReviewBanner`). Ses commentaires vivent dans une **marge de 320 px**
 * à droite (`ReviewMargin`), ancrés sur leur passage par une décoration
 * de l'éditeur (`useReviewAnchors`) ; la grille ne s'ouvre qu'avec des
 * commentaires, et sous `MARGIN_MIN_WIDTH` la marge passe sous les notes.
 * Le bouton se cache, comme dans la maquette, pendant la relecture, pendant
 * une dictée et sur des notes vides. L'action de la colonne lance la
 * vérification ici (`reviewAsked`).
 */
export function ResourceSheet({
  skillId,
  resource,
  doc,
  crumbs,
  onClose,
  reviewAsked,
  onReviewTaken,
  onReviewingChange,
}: {
  skillId: string
  resource: Resource
  doc: ResourceNotes['doc']
  crumbs: ReactNode
  onClose: () => void
  /** La colonne demande de vérifier ces notes (« Vérifier les notes »). */
  reviewAsked: boolean
  onReviewTaken: () => void
  /** Relit ou attend un passage : la colonne montre l'action en cours. */
  onReviewingChange: (busy: boolean) => void
}) {
  // L'invite de la page vierge, tue pendant qu'on dicte (`prod/Notes`).
  const recordingRef = useRef(false)
  // Options figées une fois (cf. `NotesEditor`) : `useEditor` les
  // réappliquerait à chaque changement d'identité.
  const [options] = useState(() => {
    const content = toEditorDoc({ doc, questions: [] })
    return {
      extensions: editorExtensions(nodeViews(), {
        blankPlaceholder: () =>
          recordingRef.current ? null : 'Écris ou dicte',
      }),
      content,
      // Rien d'écrit : on écrit tout de suite, comme sur une page vierge.
      autofocus: doc === null ? ('start' as const) : false,
      editorProps: {
        attributes: {
          class: cn(
            NOTE_PROSE,
            'outline-none',
            // Les invites des blocs vides, comme dans les notes du savoir.
            '[&.ProseMirror-focused_.is-empty]:before:pointer-events-none [&.ProseMirror-focused_.is-empty]:before:float-left [&.ProseMirror-focused_.is-empty]:before:h-0 [&.ProseMirror-focused_.is-empty]:before:text-foreground/30 [&.ProseMirror-focused_.is-empty]:before:content-[attr(data-placeholder)]',
          ),
        },
      },
    }
  })
  const editor = useEditor(options, [])

  const save = useSaveResourceNotes(resource.id)
  const { status, flush } = useDocAutosave(editor, save.mutateAsync)
  const statusShown = useStatusShown(status)

  const area = useRef<HTMLDivElement>(null)
  const [widthRef, width] = useElementWidth<HTMLDivElement>()

  const { dictation, here } = useDictationIn(editor, resource.id)
  const recording = here && dictation?.state.step === 'recording'
  const busy = here && !!dictation?.busy
  useEffect(() => {
    recordingRef.current = recording
    if (editor) refreshPlaceholders(editor)
  }, [editor, recording])

  // La vérification et ses commentaires.
  const reviewStatus = useCompanionAction('review')
  const { data: comments = [] } = useReviewComments(resource.id)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Le commentaire actif a pu partir (supprimé ailleurs, relu) : plus d'actif.
  const shownActive = comments.some((c) => c.id === activeId) ? activeId : null
  const review = useReview({
    resourceId: resource.id,
    flush,
    onComments: useCallback((ids: string[]) => setActiveId(ids[0]), []),
  })
  const missing = useReviewAnchors(editor, comments, shownActive, setActiveId)
  const hasText = useEditorState({
    editor,
    selector: ({ editor: e }) => !!e && e.state.doc.textContent.trim() !== '',
  })

  const { start: startReview, busy: reviewing } = review
  useEffect(() => {
    if (!editor || !reviewAsked) return
    onReviewTaken()
    if (reviewStatus.available && !reviewing) startReview()
  }, [
    editor,
    reviewAsked,
    onReviewTaken,
    reviewStatus.available,
    reviewing,
    startReview,
  ])

  useEffect(() => onReviewingChange(reviewing), [reviewing, onReviewingChange])
  useEffect(() => () => onReviewingChange(false), [onReviewingChange])

  if (!editor) return null
  const hasMargin = comments.length > 0
  const aligned = hasMargin && width >= MARGIN_MIN_WIDTH
  const showReview =
    review.state.step !== 'running' &&
    review.state.step !== 'paste' &&
    !busy &&
    hasText

  const notesRow = (
    <div className="flex min-h-[30px] items-center gap-2 px-2">
      <span className="text-[13px] font-semibold">Notes</span>
      <span className="ml-auto" />
      {dictation && (
        <DictationButton
          step={here ? dictation.state.step : 'idle'}
          available={dictation.available}
          reason={dictation.reason}
          onStart={dictation.start}
          onStop={dictation.stop}
        />
      )}
      {showReview && (
        <ReviewButton
          again={hasMargin || review.state.step === 'nothing'}
          available={reviewStatus.available}
          reason={reviewStatus.reason}
          onStart={review.start}
        />
      )}
    </div>
  )

  const notes = (
    <div className="min-w-0">
      <ReviewBanner
        state={review.state}
        resource={resource}
        onPaste={review.submitPaste}
        onCancel={review.dismiss}
        onRetry={review.retry}
        onDismiss={review.dismiss}
      />
      <EditorContent editor={editor} />
      {here && dictation && (
        <DictationStrip
          state={dictation.state}
          levels={dictation.levels}
          onUndo={dictation.undo}
          onRetry={dictation.retry}
          onDismiss={dictation.dismiss}
        />
      )}
    </div>
  )

  const margin = hasMargin && (
    <ReviewMargin
      editor={editor}
      resourceId={resource.id}
      comments={comments}
      missing={missing}
      activeId={shownActive}
      onActivate={setActiveId}
      aligned={aligned}
    />
  )

  return (
    <div ref={widthRef} className="review-palette w-full">
      <div className="mx-auto flex h-11 w-full max-w-[912px] items-center gap-2.5 px-26 text-[13px] text-muted-foreground max-[700px]:px-6">
        {crumbs}
        <SaveState status={status} shown={statusShown} />
      </div>
      {/* La colonne des notes : 96 px de marge (les poignées y vivent) ;
          l'en-tête et ses lignes ont le padding des blocs (8 px). Avec des
          commentaires, la marge de 320 px s'ouvre à droite des notes. */}
      <div
        ref={area}
        className={cn(
          'relative mx-auto flex w-full flex-col pt-9 pb-[30vh] selection:bg-(--note-accent)/28',
          aligned
            ? 'max-w-[1268px] pr-10 pl-24'
            : 'max-w-[912px] px-24 max-[700px]:px-4',
        )}
      >
        <div className="flex flex-col gap-4 px-2 pb-4">
          <ResourceHeader
            resource={resource}
            // Lu au moment de retirer : « … et ses notes ? » si elles
            // portent du texte.
            hasNotes={() => editor.state.doc.textContent.trim() !== ''}
            onClose={onClose}
          />
          <div className="flex flex-col gap-2">
            <ResourcePart resource={resource} />
            <ResourceScope skillId={skillId} resourceId={resource.id} />
          </div>
          <div aria-hidden className="h-px bg-border/60" />
        </div>
        {aligned ? (
          <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-x-7">
            {notesRow}
            <ReviewMarginHead comments={comments} />
            {notes}
            {margin}
          </div>
        ) : (
          <>
            {notesRow}
            {notes}
            {margin}
          </>
        )}
        <ColumnResize editor={editor} area={area} />
        <CodeLanguage editor={editor} area={area} />
        {/* La marge des commentaires à droite : l'ampoule dans l'entre-deux. */}
        <AnnotationMargin editor={editor} area={area} narrow={aligned} />
        <Marquee editor={editor} area={area} />
        {/* Aucune question dans ce document : rien à supprimer au serveur. */}
        <BlockHandle editor={editor} area={area} onDeleteQuestion={() => {}} />
        <SlashMenu editor={editor} area={area} />
        <EmojiMenu editor={editor} area={area} />
        <MentionMenu editor={editor} area={area} skillId={skillId} />
        <LinkHover editor={editor} area={area} />
        <SelectionBar editor={editor} area={area} />
      </div>
    </div>
  )
}

/** L'état d'enregistrement, autour d'une modification (cf. `useStatusShown`). */
function SaveState({ status, shown }: { status: SaveStatus; shown: boolean }) {
  return (
    <span
      role="status"
      className={cn(
        'ml-auto shrink-0 text-xs transition-opacity duration-300',
        !shown && 'opacity-0',
        status === 'error' && 'text-destructive',
      )}
    >
      {SAVE_STATUS_LABEL[status]}
    </span>
  )
}
