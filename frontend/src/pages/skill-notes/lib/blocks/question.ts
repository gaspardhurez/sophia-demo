import { NodeSelection } from '@tiptap/pm/state'
import { CircleHelp } from 'lucide-react'

import { QUESTION, QuestionNode, questionGuard } from '../question-node'
import { placeBlock } from './place-block'
import type { BlockSpec } from './types'

/**
 * La question **dans le texte** (décision de l'utilisateur, 17/11) : le nœud
 * `question` (cf. `../question-node`) redevient un bloc visible, un encadré
 * au dessin de la bulle d'une annotation. `/Question` le pose sans id, son
 * formulaire ouvert ; enregistrée, la question est créée en table et le
 * nœud prend son id. La question attachée à un passage, elle, naît d'une
 * sélection, en annotation (#213). Le menu « / » ne la propose que là où
 * l'on crée des questions (pas dans les notes d'une ressource).
 */
export const questionBlock: BlockSpec = {
  name: QUESTION,
  nodes: [QUESTION],
  extensions: ({ questionView }) => [
    QuestionNode.configure({ view: questionView }),
    questionGuard,
  ],
  items: [
    {
      id: 'question',
      label: 'Question',
      section: 'learn',
      aliases: ['question', 'quiz', 'interro', 'carte', 'flashcard'],
      icon: CircleHelp,
      action: {
        kind: 'insert',
        run: (editor, range) =>
          placeBlock(
            editor,
            range,
            editor.schema.nodes[QUESTION].create({ id: null }),
            (doc, at) => NodeSelection.create(doc, at),
          ),
      },
    },
  ],
}
