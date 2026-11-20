import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/shared/lib/utils'

import { takeFresh } from '../../lib/example-node'
import { AnnotationForm, CARD, ExampleBody } from '../annotation-card'

/**
 * Un exemple dans le texte (cf. `lib/example-node`) : l'encadré au dessin de
 * la bulle d'une annotation, à la largeur du texte, sans hauteur bornée. Ses
 * actions (Modifier, Supprimer) au survol. Sans texte, son formulaire :
 * Annuler retire l'encadré neuf.
 */
export function ExampleBoxView({
  editor,
  node,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const { id, title, text } = node.attrs as {
    id: string | null
    title: string
    text: string
  }
  const [editing, setEditing] = useState(!text)
  const [autoFocus] = useState(() => takeFresh(id))
  const done = () => {
    setEditing(false)
    editor.commands.focus()
  }
  return (
    <NodeViewWrapper contentEditable={false} className="my-2">
      <AnnotationBox>
        {editing && editor.isEditable ? (
          <AnnotationForm
            kind="example"
            initial={text ? { title, text } : null}
            autoFocus={autoFocus || !!text}
            onCancel={() => (text ? done() : deleteNode())}
            onSubmit={(fields) => {
              updateAttributes({
                title: fields.first.trim(),
                text: fields.second,
              })
              done()
            }}
          />
        ) : (
          <ExampleBody
            title={title}
            text={text}
            actions={editor.isEditable}
            capped={false}
            onEdit={() => setEditing(true)}
            onRemove={() => deleteNode()}
          />
        )}
      </AnnotationBox>
    </NodeViewWrapper>
  )
}

/** Le cadre d'un encadré : celui d'une bulle, ses actions au survol. */
export function AnnotationBox({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        CARD,
        'border-(--note-accent)/40 [&_[data-actions]]:opacity-0 [&_[data-actions]]:transition-opacity hover:[&_[data-actions]]:opacity-100 focus-within:[&_[data-actions]]:opacity-100',
      )}
    >
      {children}
    </div>
  )
}
