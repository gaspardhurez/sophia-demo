import type { JSONContent } from '@tiptap/core'
import { Plus } from 'lucide-react'
import { type ReactNode, type Ref, useMemo, useState } from 'react'

import type { CentralIdea } from '@/entities/companion'
import type { Notes } from '@/entities/note'
import { cn } from '@/shared/lib/utils'
import { Switch } from '@/shared/ui'

import {
  type IdeaAnchor,
  ideaAnchor,
  ideaPart,
  ideaPlace,
  sectionFragment,
  sectionHasText,
  sectionIds,
} from '../../lib/central-ideas'
import {
  type QuestionSection,
  type QuestionSpot,
  questionSections,
  type SectionPart,
} from '../../lib/question-sections'
import { toEditorDoc } from '../../model/document'
import { QuestionsContext, useQuestions } from '../../model/questions-context'
import { useAddQuestion } from '../../model/use-add-question'
import type { SaveStatus } from '../../model/use-autosave'
import { useCompanionAction } from '../../model/use-companion-action'
import { useQuestionActions } from '../../model/use-question-actions'
import {
  type SectionIdeas,
  useSectionIdeas,
} from '../../model/use-section-ideas'
import { useStatusShown } from '../../model/use-status-shown'
import { useWhenVisible } from '../../model/use-when-visible'
import { IdeaCard, IdeasNotice } from './idea-card'
import { PartNotes } from './part-notes'
import { QuestionCard } from './question-card'
import { SuggestionsSwitch } from './suggestions-switch'

const STATUS: Record<SaveStatus, string> = {
  saved: 'Enregistré',
  pending: 'Enregistrement…',
  saving: 'Enregistrement…',
  error: "Échec de l'enregistrement",
}

/** Une idée centrale montrée : sa carte (`key` = `section:rang`), le bloc
 *  où elle se lit, et son passage dans sa partie (pour le surlignage). */
interface ShownIdea {
  key: string
  idea: CentralIdea
  anchor: IdeaAnchor | null
  passage: number[] | null
}

/** Ce que les parties savent faire des idées : en écrire la question, la
 *  laisser, et les angles des questions qu'on en a tirées. */
interface IdeaActions {
  busy: boolean
  write: (shown: ShownIdea) => void
  dismiss: (shown: ShownIdea) => void
  /** L'angle de chaque question née d'une idée, le temps de la visite. */
  angles: Record<string, string>
}

/**
 * « Préparer les questions » (#173, `prod/Notes` états c et d ; idéation
 * tranchée `Preparer les questions` 4), à la place des notes : **par
 * section** du document, les notes à gauche, ses questions à droite —
 * chacune à la hauteur de sa partie, le plus petit titre qui la contient
 * (`lib/question-sections`). Le survol d'une question surligne son passage
 * dans les notes (et entoure les questions du même passage). Énoncé et
 * réponse s'écrivent sur place ; « + Question » en pose une neuve dans le
 * document, en fin de partie. « Cacher les notes » ne laisse que la liste
 * des questions, section par section, avec leur nombre.
 *
 * **« 🧠 Suggestions »** (éteint à l'arrivée, non retenu) : Sophia propose,
 * section par section, les idées à savoir sans les notes que les questions
 * ne couvrent pas encore (`POST /skills/{id}/central-ideas`). Une section se
 * demande la première fois qu'elle se montre, interrupteur allumé, et une
 * seule fois par visite (`useSectionIdeas`) ; ses idées sont des cartes
 * pointillées roses sous les questions de leur partie. **Écrire la
 * question** en pose une après le passage de l'idée (`lib/central-ideas`),
 * sa réponse attendue amorcée du texte du passage, et l'angle dessous ;
 * **Pas besoin** retire la carte. Indisponible : l'interrupteur se grise,
 * son motif en infobulle.
 *
 * Les questions restent des blocs du document : la vue le lit (`notes`, en
 * direct) et ne l'écrit que pour en poser une (`useAddQuestion`) ; leur
 * contenu s'enregistre comme dans l'éditeur (`useQuestionActions`).
 */
export function PrepareQuestions({
  skillId,
  notes,
  crumbs,
}: {
  skillId: string
  notes: Notes
  crumbs: ReactNode
}) {
  const doc = useMemo(() => toEditorDoc(notes) as JSONContent, [notes])
  const sections = useMemo(() => questionSections(doc), [doc])
  const ids = useMemo(() => sectionIds(sections), [sections])
  const [hidden, setHidden] = useState(false)

  // Sans éditeur : seul l'enregistrement du contenu des questions sert.
  const actions = useQuestionActions({ editor: null, skillId, notes })
  const adder = useAddQuestion(skillId)
  const context = useMemo(
    () => ({ ...actions.state, takeFocus: adder.takeFocus }),
    [actions.state, adder.takeFocus],
  )
  const status: SaveStatus = adder.busy ? 'saving' : actions.status
  const statusShown = useStatusShown(status)

  // Les suggestions : voulues, et possibles.
  const ideasStatus = useCompanionAction('ideas')
  const [wanted, setWanted] = useState(false)
  const suggest = wanted && ideasStatus.available
  const ideas = useSectionIdeas(skillId)
  const [angles, setAngles] = useState<Record<string, string>>({})

  const ideaActions = (section: QuestionSection): IdeaActions => ({
    busy: adder.busy,
    angles,
    dismiss: (shown) => ideas.drop(shown.key),
    write: (shown) =>
      void adder
        .add(ideaPlace(doc, section, shown.anchor), shown.anchor?.text ?? null)
        .then((id) => {
          if (!id) return
          ideas.drop(shown.key)
          setAngles((a) => ({ ...a, [id]: shown.idea.angle }))
        }),
  })

  return (
    <QuestionsContext.Provider value={context}>
      {/* Le fil, comme sur les notes. */}
      <div className="mx-auto flex h-11 w-full max-w-[1196px] items-center gap-2.5 px-12 text-[13px] text-muted-foreground max-[700px]:px-4">
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
      {/* `notes-palette` : le rose des suggestions vient de la palette. */}
      <div className="notes-palette mx-auto flex w-full max-w-[1196px] flex-col gap-2 px-12 pt-8 pb-[72px] max-[700px]:px-4">
        <div className="flex flex-wrap items-center gap-[18px] pb-2">
          <h1 className="flex-1 font-heading text-[28px] font-bold tracking-[-0.02em]">
            Préparer les questions
          </h1>
          <SuggestionsSwitch
            on={suggest}
            available={ideasStatus.available}
            reason={ideasStatus.reason}
            onToggle={() => setWanted((w) => !w)}
          />
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-foreground/75"
          >
            Cacher les notes
            <Switch on={hidden} />
          </button>
        </div>
        {sections.map((s, i) => {
          const id = ids[i]
          const asked = suggest && sectionHasText(s)
          return (
            <SectionView
              // Une autre disposition : une autre section à surveiller.
              key={`${id}:${hidden}`}
              section={s}
              hidden={hidden}
              watch={asked}
              onSeen={() => ideas.request(id, sectionFragment(doc, s))}
              ideas={asked ? ideas.bySection[id] : undefined}
              shown={
                asked
                  ? shownIdeas(doc, s, id, ideas.bySection[id], ideas.gone)
                  : []
              }
              onRetry={() => ideas.request(id, sectionFragment(doc, s), true)}
              actions={ideaActions(s)}
              addBusy={adder.busy}
              onAdd={(p) => void adder.add(p.end)}
            />
          )
        })}
      </div>
    </QuestionsContext.Provider>
  )
}

/** Les cartes d'une section : ses idées rendues, moins celles écartées ou
 *  écrites, chacune rattachée à son passage. */
function shownIdeas(
  doc: JSONContent,
  section: QuestionSection,
  id: string,
  ideas: SectionIdeas | undefined,
  gone: ReadonlySet<string>,
): ShownIdea[] {
  if (ideas?.state !== 'done') return []
  return ideas.ideas.flatMap((idea, rank) => {
    const key = `${id}:${rank}`
    if (gone.has(key)) return []
    const anchor = ideaAnchor(doc, section, idea.quote)
    const part = ideaPart(section, anchor)
    const at = anchor ? part.at.indexOf(anchor.index) : -1
    return [{ key, idea, anchor, passage: at >= 0 ? [at] : null }]
  })
}

/**
 * Une section, notes en face ou cachées. Elle demande ses idées la première
 * fois qu'elle se montre (`watch`, `onSeen`) ; leurs cartes vont à la partie
 * de leur passage (la dernière sans passage), ce qui se dit pendant la
 * demande ou d'un échec, à la première.
 */
function SectionView({
  section,
  hidden,
  watch,
  onSeen,
  ideas,
  shown,
  onRetry,
  actions,
  addBusy,
  onAdd,
}: {
  section: QuestionSection
  hidden: boolean
  watch: boolean
  onSeen: () => void
  ideas: SectionIdeas | undefined
  shown: ShownIdea[]
  onRetry: () => void
  actions: IdeaActions
  addBusy: boolean
  onAdd: (part: SectionPart) => void
}) {
  const ref = useWhenVisible<HTMLElement>(watch, onSeen)

  const part = (p: SectionPart, first: boolean) => {
    const mine = shown.filter((s) => ideaPart(section, s.anchor).key === p.key)
    const notice = first && <IdeasNotice ideas={ideas} onRetry={onRetry} />
    const add = (
      <AddQuestion
        compact={hidden}
        disabled={addBusy}
        onClick={() => onAdd(p)}
      />
    )
    const props = { part: p, first, ideas: mine, notice, actions, add }
    return hidden ? (
      <ListPart key={p.key} {...props} />
    ) : (
      <SidePart key={p.key} {...props} />
    )
  }

  if (hidden)
    return (
      <ListSection sectionRef={ref} section={section}>
        {section.parts.map((p, i) => part(p, i === 0))}
      </ListSection>
    )
  return (
    <section ref={ref} className="border-t border-border/60 pt-5 pb-2">
      {section.title && (
        <h2 className="pb-1 font-heading text-[19px] font-bold tracking-[-0.01em]">
          {section.title.text}
        </h2>
      )}
      {section.parts.map((p, i) => part(p, i === 0))}
    </section>
  )
}

/** Ce que la souris montre dans les notes d'une partie : le passage d'une
 *  question, ou celui d'une idée. */
type Hovered =
  | { kind: 'question'; spot: QuestionSpot }
  | { kind: 'idea'; key: string; passage: number[] | null }

interface PartProps {
  part: SectionPart
  first: boolean
  ideas: ShownIdea[]
  notice: ReactNode
  actions: IdeaActions
  add: ReactNode
}

/**
 * Une partie, notes en face : le texte à gauche (1,15 fr), ses questions,
 * ses suggestions et « + Question » à droite (1 fr), 36 px entre ; sous
 * 700 px, l'un sous l'autre. Une sous-partie (H2 sous un H1…) a son titre,
 * et ses questions descendent à la hauteur de son texte.
 */
function SidePart({ part, first, ideas, notice, actions, add }: PartProps) {
  const { question } = useQuestions()
  // Ce qui est survolé, et la teinte du dernier surlignage : il la garde en
  // s'effaçant.
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [tone, setTone] = useState<'question' | 'idea'>('question')
  // Entrer montre ; sortir n'efface que ce qu'on quitte (la souris peut
  // déjà être entrée ailleurs).
  const hover = (on: boolean, next: Hovered, same: (h: Hovered) => boolean) => {
    if (on) setTone(next.kind)
    setHovered((h) => (on ? next : h && same(h) ? null : h))
  }
  const passage =
    hovered?.kind === 'question'
      ? hovered.spot.passage
      : (hovered?.passage ?? null)
  const lit =
    hovered?.kind === 'question' ? hovered.spot.passage?.join('.') : undefined
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-9 max-[700px]:grid-cols-1 max-[700px]:gap-3',
        first ? 'pt-0.5' : 'pt-[18px]',
      )}
    >
      <div className="flex min-w-0 flex-col">
        {part.title && (
          <h3 className="pb-0.5 font-heading text-[15.5px] font-[650]">
            {part.title.text}
          </h3>
        )}
        <PartNotes
          // Un contenu changé (une question posée) : un texte neuf.
          key={JSON.stringify(part.blocks)}
          blocks={part.blocks}
          passage={passage}
          tone={tone}
        />
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2 max-[700px]:pt-0',
          part.title ? 'pt-[30px]' : 'pt-1',
        )}
      >
        {part.questions.map((spot) => {
          const q = question(spot.id)
          return (
            q && (
              <QuestionCard
                key={q.id}
                question={q}
                variant="side"
                lit={!!lit && spot.passage?.join('.') === lit}
                angle={actions.angles[q.id]}
                onHover={(on) =>
                  hover(
                    on,
                    { kind: 'question', spot },
                    (h) => h.kind === 'question' && h.spot === spot,
                  )
                }
              />
            )
          )
        })}
        {ideas.map((shown) => (
          <IdeaCard
            key={shown.key}
            idea={shown.idea}
            variant="side"
            busy={actions.busy}
            onWrite={() => actions.write(shown)}
            onDismiss={() => actions.dismiss(shown)}
            onHover={(on) =>
              hover(
                on,
                { kind: 'idea', key: shown.key, passage: shown.passage },
                (h) => h.kind === 'idea' && h.key === shown.key,
              )
            }
          />
        ))}
        {notice}
        {add}
      </div>
    </div>
  )
}

/** Notes cachées : une section, son titre et son nombre de questions. */
function ListSection({
  section,
  sectionRef,
  children,
}: {
  section: QuestionSection
  sectionRef: Ref<HTMLElement>
  children: ReactNode
}) {
  const n = section.count
  return (
    <section
      ref={sectionRef}
      className="flex max-w-[760px] flex-col gap-1.5 border-t border-border/60 pt-[18px] pb-1.5"
    >
      <div className="flex items-center gap-2.5">
        {/* Le texte d'avant tout titre : son nombre seul. */}
        {section.title && (
          <h2 className="font-heading text-[17px] font-bold">
            {section.title.text}
          </h2>
        )}
        <span className="text-[12.5px] text-muted-foreground">
          {n ? `${n} question${n > 1 ? 's' : ''}` : 'aucune question'}
        </span>
      </div>
      {children}
    </section>
  )
}

/** Notes cachées : une partie, son titre s'il en a un, ses questions et ses
 *  suggestions. */
function ListPart({ part, first, ideas, notice, actions, add }: PartProps) {
  const { question } = useQuestions()
  return (
    <div className={cn('flex flex-col gap-1', !first && 'pt-1.5')}>
      {part.title && (
        <h3 className="px-3 pt-1 text-[13.5px] font-semibold text-foreground/75">
          {part.title.text}
        </h3>
      )}
      {part.questions.map((spot) => {
        const q = question(spot.id)
        return (
          q && (
            <QuestionCard
              key={q.id}
              question={q}
              variant="list"
              angle={actions.angles[q.id]}
            />
          )
        )
      })}
      {ideas.map((shown) => (
        <IdeaCard
          key={shown.key}
          idea={shown.idea}
          variant="list"
          busy={actions.busy}
          onWrite={() => actions.write(shown)}
          onDismiss={() => actions.dismiss(shown)}
        />
      ))}
      {notice}
      {add}
    </div>
  )
}

/** « + Question » : icône et « Question » en face des notes, « + Question »
 *  en texte dans la liste. */
function AddQuestion({
  compact,
  disabled,
  onClick,
}: {
  compact: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center self-start rounded-md text-[12.5px] font-medium text-foreground/75 hover:bg-muted disabled:cursor-default disabled:opacity-60',
        compact ? 'h-[26px] px-3' : 'h-7 gap-[5px] px-2',
      )}
    >
      {compact ? (
        '+ Question'
      ) : (
        <>
          <Plus className="size-3" strokeWidth={2} />
          Question
        </>
      )}
    </button>
  )
}
