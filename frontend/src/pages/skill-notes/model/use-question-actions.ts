import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  type Notes,
  useCreateQuestion,
  useDeleteQuestion,
  useUpdateQuestion,
} from '@/entities/note'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import { REMOVE_QUESTION } from '../lib/question-node'
import { questionPos } from './document'
import type { QuestionDraft, QuestionsState } from './questions-context'

const DELAY = 600

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

/**
 * Les questions de la page : les créer (le formulaire d'une annotation,
 * #213 — l'appelant les ancre), les modifier (enregistrées après une pause),
 * les supprimer. Le contenu vit en table ; le document ne porte que l'ancre,
 * que l'autosave enregistre.
 */
export function useQuestionActions({
  editor,
  skillId,
  notes,
}: {
  editor: Editor | null
  skillId: string
  notes: Notes
}) {
  const create = useCreateQuestion(skillId)
  const update = useUpdateQuestion(skillId)
  const remove = useDeleteQuestion(skillId)

  const byId = useMemo(
    () => new Map(notes.questions.map((q) => [q.id, q])),
    [notes.questions],
  )

  // --- Créer -----------------------------------------------------------------
  const focusNext = useRef(new Set<string>())

  /**
   * Crée une question depuis le formulaire d'une annotation (#213), sans la
   * placer : **factuelle** (le formulaire n'a pas la nature) ; une réponse
   * sur plusieurs lignes devient une liste d'éléments, une seule ligne une
   * réponse libre. Rend son id, nul en cas d'échec.
   */
  const createLoose = useCallback(
    async ({ prompt, answer }: { prompt: string; answer: string }) => {
      const lines = answer
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      try {
        const question = await create.mutateAsync({
          kind: 'factual',
          form: lines.length > 1 ? 'list' : 'free',
          prompt: prompt.trim(),
          answer: lines.length === 1 ? lines[0] : null,
          points: lines.length > 1 ? lines.map((text) => ({ text })) : [],
        })
        return question.id
      } catch (err) {
        fail(err)
        return null
      }
    },
    // `create` change d'identité à chaque rendu ; seul `mutateAsync` sert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // --- Supprimer -------------------------------------------------------------
  /** Le serveur d'abord ; le nœud part ensuite, seul retrait permis. */
  const removeQuestion = useCallback(
    async (id: string) => {
      if (!editor) return
      try {
        await remove.mutateAsync(id)
      } catch (err) {
        fail(err)
        return
      }
      const pos = questionPos(editor.state.doc, id)
      const node = pos === null ? null : editor.state.doc.nodeAt(pos)
      if (pos === null || !node) return
      editor.view.dispatch(
        editor.state.tr
          .delete(pos, pos + node.nodeSize)
          .setMeta(REMOVE_QUESTION, true)
          .setMeta('addToHistory', false),
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  )

  // --- Modifier --------------------------------------------------------------
  // Une modification par question attend sa pause ; la dernière l'emporte.
  const waiting = useRef(
    new Map<string, { draft: QuestionDraft; timer: number }>(),
  )
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(false)

  const send = useCallback(
    (id: string) => {
      const entry = waiting.current.get(id)
      if (!entry) return
      clearTimeout(entry.timer)
      waiting.current.delete(id)
      const { draft } = entry
      update.mutate(
        {
          id,
          body: {
            kind: draft.kind,
            form: draft.form,
            prompt: draft.prompt.trim(),
            // Les deux s'enregistrent : changer de forme ne perd rien.
            answer: draft.answer.trim() || null,
            points: draft.points
              .map((p) => ({ id: p.id, text: p.text.trim() }))
              .filter((p) => p.text),
          },
        },
        {
          onSuccess: () => setFailed(false),
          onError: () => setFailed(true),
          onSettled: () => setPending((n) => n - 1),
        },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const save = useCallback(
    (id: string, draft: QuestionDraft) => {
      const entry = waiting.current.get(id)
      if (entry) clearTimeout(entry.timer)
      else setPending((n) => n + 1)
      waiting.current.set(id, {
        draft,
        timer: window.setTimeout(() => send(id), DELAY),
      })
    },
    [send],
  )

  // Quitter la page : ce qui attend part tout de suite.
  useEffect(() => {
    const all = waiting.current
    return () => [...all.keys()].forEach(send)
  }, [send])

  /**
   * Le formulaire d'une annotation (#213) écrit l'énoncé et la réponse : sur
   * plusieurs lignes, une liste — chaque ligne garde l'id de l'élément à sa
   * place ; sur une ligne, une réponse libre. L'autre forme garde ce
   * qu'elle avait (changer de forme ne perd rien) ; la nature ne change pas.
   */
  const updateLoose = useCallback(
    (id: string, { prompt, answer }: { prompt: string; answer: string }) => {
      const question = byId.get(id)
      if (!question) return
      const lines = answer
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const list = lines.length > 1
      save(id, {
        kind: question.kind,
        form: list ? 'list' : 'free',
        prompt,
        answer: list ? (question.answer ?? '') : (lines[0] ?? ''),
        points: list
          ? lines.map((text, i) => ({
              id: question.points[i]?.id ?? crypto.randomUUID(),
              text,
            }))
          : question.points,
      })
    },
    [byId, save],
  )

  /** Supprime une question en table seulement (#213 : ses ancres partent
   *  ensuite, du document). */
  const removeLoose = useCallback(
    async (id: string) => {
      try {
        await remove.mutateAsync(id)
        return true
      } catch (err) {
        fail(err)
        return false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const state = useMemo<QuestionsState>(
    () => ({
      question: (id) => byId.get(id),
      save,
      takeFocus: (id) => focusNext.current.delete(id),
      create: createLoose,
      update: updateLoose,
      remove: removeLoose,
    }),
    [byId, save, createLoose, updateLoose, removeLoose],
  )

  return {
    state,
    remove: removeQuestion,
    /** Les modifications de questions : en attente, ou un échec. */
    status: failed ? 'error' : pending > 0 ? 'pending' : 'saved',
  } as const
}
