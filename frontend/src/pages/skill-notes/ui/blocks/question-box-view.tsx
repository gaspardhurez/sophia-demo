import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { useState } from 'react'

import { answerLines } from '../../lib/question-anchors'
import { REMOVE_QUESTION } from '../../lib/question-node'
import { useQuestions } from '../../model/questions-context'
import { AnnotationForm, QuestionBody } from '../annotation-card'
import { AnnotationBox } from './example-box-view'

/**
 * Une question dans le texte (cf. `lib/blocks/question`) : l'encadré au
 * dessin de la bulle d'une annotation — l'énoncé, « Voir la réponse » ; ses
 * actions (Modifier, Supprimer) au survol. Le nœud ne porte que l'id ; le
 * contenu vit en table (`useQuestions`). Sans id, le formulaire d'une
 * question neuve : Enregistrer la crée et donne son id au nœud, Annuler
 * retire l'encadré. Supprimer la retire de la table, puis le nœud — seul
 * retrait que la garde des questions laisse passer.
 */
export function QuestionBoxView({
  editor,
  node,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const id = node.attrs.id as string | null
  const questions = useQuestions()
  const question = id ? questions.question(id) : undefined
  const [editing, setEditing] = useState(!id)
  const done = () => {
    setEditing(false)
    editor.commands.focus()
  }

  // Créée, elle arrive avec la liste rechargée ; supprimée ailleurs, rien.
  if (id && !question) return <NodeViewWrapper contentEditable={false} />
  return (
    <NodeViewWrapper contentEditable={false} className="my-2">
      <AnnotationBox>
        {editing && editor.isEditable ? (
          <AnnotationForm
            kind="question"
            initial={
              question
                ? {
                    title: question.prompt,
                    text: answerLines(question).join('\n'),
                  }
                : null
            }
            onCancel={() => (id ? done() : deleteNode())}
            onSubmit={async ({ first, second }) => {
              if (id) questions.update?.(id, { prompt: first, answer: second })
              else {
                const created = await questions.create?.({
                  prompt: first,
                  answer: second,
                })
                if (!created) return
                updateAttributes({ id: created })
              }
              done()
            }}
          />
        ) : (
          question && (
            <QuestionBody
              question={question}
              actions={editor.isEditable && !!questions.update}
              onEdit={() => setEditing(true)}
              onRemove={async () => {
                if (!id || !(await questions.remove?.(id))) return
                const pos = getPos()
                if (typeof pos !== 'number') return
                editor.view.dispatch(
                  editor.state.tr
                    .delete(pos, pos + node.nodeSize)
                    .setMeta(REMOVE_QUESTION, true)
                    .setMeta('addToHistory', false),
                )
              }}
            />
          )
        )}
      </AnnotationBox>
    </NodeViewWrapper>
  )
}
