import { ReactNodeViewRenderer } from '@tiptap/react'

import type { BlockContext } from '../lib/blocks'
import { ExampleBoxView } from './blocks/example-box-view'
import { ImageView } from './blocks/image-view'
import { QuestionBoxView } from './blocks/question-box-view'
import { ResourceMentionView } from './blocks/resource-mention-view'
import { SkillLinkView } from './blocks/skill-link-view'

/**
 * Les vues React des blocs du document (`BlockContext`), partagées par
 * l'éditeur des notes, le texte de « Préparer les questions » et les notes
 * d'une ressource. `questions` : faux là où les questions se montrent
 * ailleurs (« Préparer les questions ») — leur encadré dans le texte ne
 * s'affiche pas.
 */
export function nodeViews({ questions = true } = {}): BlockContext {
  return {
    exampleView: ReactNodeViewRenderer(ExampleBoxView, {
      ignoreMutation: () => true,
    }),
    ...(questions && {
      questionView: ReactNodeViewRenderer(QuestionBoxView, {
        ignoreMutation: () => true,
      }),
    }),
    imageView: ReactNodeViewRenderer(ImageView, {
      ignoreMutation: () => true,
    }),
    skillLinkView: ReactNodeViewRenderer(SkillLinkView, {
      as: 'span',
      ignoreMutation: () => true,
    }),
    resourceMentionView: ReactNodeViewRenderer(ResourceMentionView, {
      as: 'span',
      ignoreMutation: () => true,
    }),
  }
}
