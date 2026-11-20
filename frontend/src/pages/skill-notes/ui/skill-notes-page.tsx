import {
  type CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { domainColorValues, useDomains } from '@/entities/domain'
import { useNotes } from '@/entities/note'
import { pickCycle, usePlans } from '@/entities/plan'
import { useNotesOpened } from '@/entities/recall'
import { type Skill, useSkill, useSkills } from '@/entities/skill'
import { FrameStudyDialog } from '@/features/plan/frame-study'
import { isNotFound } from '@/shared/api'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { Skeleton, SkeletonRegion } from '@/shared/ui'

import { DictationContext } from '../model/dictation-context'
import { NO_CURSOR } from '../model/use-companion-action'
import { useDictation } from '../model/use-dictation'
import { NotesEditor } from './notes-editor'
import { NotesHeader } from './notes-header'
import { PrepareQuestions } from './prepare-questions/prepare-questions'
import { ResourceView } from './resource-view/resource-view'
import { SideColumn } from './side-column/side-column'

/**
 * La page des notes d'un savoir (design #88, `prod/Notes`), `/skills/:id/notes`.
 * En pleine page, comme Notion — sous l'en-tête de l'app, toute la largeur et
 * toute la hauteur, sans feuille encadrée —, toujours éditable : en haut, le fil — domaine ›
 * ancêtres › savoir › Notes, chaque maillon mène à sa page — et l'état
 * d'enregistrement ; dessous, les notes (`NotesEditor`), ou « Préparer les
 * questions » à leur place (`PrepareQuestions`, `?vue=questions`), ou une
 * ressource (`ResourceView`, `?ressource=<id>`). À gauche, la colonne
 * permanente (`SideColumn`, #173) : sommaire, ressources du cycle, actions —
 * c'est elle qui change de vue.
 */
export function SkillNotesPage() {
  const { skillId } = useParams<{ skillId: string }>()
  const { data: skill, error } = useSkill(skillId)
  // Lues sous l'id du savoir, pas celui de l'URL (qui peut être écrit sans
  // tirets) : l'éditeur range ses questions dans le cache de `skill.id`.
  const { data: notes, error: notesError } = useNotes(skill?.id)
  const { data: domains } = useDomains()
  const { data: siblings } = useSkills(skill?.domain_id)
  useDocumentTitle(skill ? `Notes — ${skill.name}` : undefined)
  // Ouvrir les notes relance le délai des questions qui restent dans les
  // interros en cours du savoir : on ne restitue pas ce qu'on vient de relire.
  const { mutate: notesOpened } = useNotesOpened()
  useEffect(() => {
    if (skill?.id) notesOpened(skill.id)
  }, [skill?.id, notesOpened])
  // `?question=<id>` : défiler jusqu'à cette question (« Voir dans les
  // notes » depuis l'interro).
  const [params, setParams] = useSearchParams()
  const focus = params.get('question')
  // `?vue=questions` : « Préparer les questions » à la place des notes (#173),
  // depuis l'action de la colonne permanente.
  const questionsView = params.get('vue') === 'questions'
  // `?ressource=<id>` : cette ressource à la place des notes (#173).
  const resourceId = params.get('ressource')
  const closeResource = useCallback(
    () =>
      setParams((p) => {
        p.delete('ressource')
        return p
      }),
    [setParams],
  )

  // La dictée (#173) : une pour la page, au curseur de l'éditeur qui l'a
  // eu en dernier (les notes, ou la ressource ouverte) ; la colonne et la
  // ressource la pilotent, les éditeurs la reçoivent par contexte.
  const dictation = useDictation(skill?.id)
  // « Vérifier les notes » de la colonne, de même : la ressource à
  // vérifier, et si une vérification relit ou attend un passage.
  const [reviewIn, setReviewIn] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const reviewTaken = useCallback(() => setReviewIn(null), [])
  // « Cadrer l'étude » (#175) : ouverte depuis l'action de la colonne ou le
  // bouton de l'en-tête, sur le cycle des notes (`pickCycle`, comme eux).
  const [framing, setFraming] = useState(false)
  const { data: plans } = usePlans(skill?.id)
  const plan = pickCycle(plans ?? [], null)
  const frame = useCallback(() => setFraming(true), [])

  const domain = domains?.find((d) => d.id === skill?.domain_id)
  const ancestors = useMemo(
    () => (skill ? ancestorsOf(skill, siblings ?? []) : []),
    [skill, siblings],
  )

  const failure = error ?? notesError
  if (failure) {
    return (
      <main className="mx-auto max-w-[1240px] px-10 py-12">
        <p className="text-sm text-muted-foreground">
          {isNotFound(failure)
            ? "Ce savoir n'existe pas ou a été supprimé."
            : 'Impossible de charger ces notes.'}
        </p>
      </main>
    )
  }

  const crumbs =
    skill && domain ? (
      <nav
        aria-label="Fil d'Ariane"
        className="flex min-w-0 items-center gap-2.5 truncate"
      >
        <Link to={`/domains/${domain.id}`} className="hover:text-foreground">
          {[domain.emoji, domain.name].filter(Boolean).join(' ')}
        </Link>
        {[...ancestors, skill].map((s) => (
          <Fragment key={s.id}>
            <span aria-hidden>›</span>
            <Link to={`/skills/${s.id}`} className="hover:text-foreground">
              {s.name}
            </Link>
          </Fragment>
        ))}
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-foreground">
          Notes
        </span>
      </nav>
    ) : (
      <Skeleton className="h-3 w-56" />
    )

  return (
    // Sans `overflow-hidden` : il casserait le sommaire collant.
    <DictationContext.Provider value={dictation}>
      <main
        className="notes-accent min-h-[calc(100svh-var(--header-h))] bg-card"
        style={accentVars(domain?.color)}
      >
        {/* La colonne permanente à gauche (#173), la vue à côté. La rangée
            prend toute la hauteur sous l'en-tête de l'app : sans quoi, sur
            des notes courtes, la colonne (et sa bordure) s'arrêtait à mi-page. */}
        <div className="flex min-h-[calc(100svh-var(--header-h))] items-stretch">
          {skill && notes && (
            <SideColumn
              skill={skill}
              domain={domain}
              notes={notes}
              dictation={{
                active: dictation.busy,
                unavailable: dictation.hasCursor ? null : NO_CURSOR,
                onDictate:
                  dictation.state.step === 'recording'
                    ? dictation.stop
                    : dictation.start,
              }}
              reviewing={reviewing}
              onReview={setReviewIn}
              framing={framing}
              onFrame={frame}
            />
          )}
          {framing && skill && plan && (
            <FrameStudyDialog
              skillId={skill.id}
              domainId={domain?.id}
              plan={plan}
              onClose={() => setFraming(false)}
            />
          )}
          <div className="min-w-0 flex-1">
            {skill && resourceId ? (
              <ResourceView
                key={resourceId}
                skillId={skill.id}
                resourceId={resourceId}
                crumbs={crumbs}
                onClose={closeResource}
                reviewAsked={reviewIn === resourceId}
                onReviewTaken={reviewTaken}
                onReviewingChange={setReviewing}
              />
            ) : skill && notes && questionsView ? (
              <PrepareQuestions
                key={skill.id}
                skillId={skill.id}
                notes={notes}
                crumbs={crumbs}
              />
            ) : skill && notes ? (
              <NotesEditor
                // Un autre savoir : un autre document, un éditeur neuf.
                key={skill.id}
                skillId={skill.id}
                header={
                  <NotesHeader
                    skillId={skill.id}
                    skillName={skill.name}
                    onFrame={frame}
                  />
                }
                notes={notes}
                crumbs={crumbs}
                focus={focus}
              />
            ) : (
              <>
                <div className="mx-auto flex h-11 w-full max-w-[912px] items-center gap-2.5 px-26 text-[13px] text-muted-foreground max-[700px]:px-6">
                  {crumbs}
                </div>
                <SkeletonRegion>
                  <div className="mx-auto flex w-full max-w-[912px] flex-col gap-4 px-26 pt-[54px] pb-[30vh] max-[700px]:px-4">
                    <Skeleton className="size-11 rounded-lg" />
                    <Skeleton className="h-12 w-72" />
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="mt-8 h-40 w-full" />
                  </div>
                </SkeletonRegion>
              </>
            )}
          </div>
        </div>
      </main>
    </DictationContext.Provider>
  )
}

/**
 * L'accent des notes : là où Notion met son bleu (sélection, halos, trait
 * d'arrivée, rectangle, titre courant du sommaire, case cochée), les notes
 * prennent l'**encre du domaine** — sa teinte 700 en clair, 400 en sombre
 * (`marks.css`, `.notes-accent`), avec les opacités de Notion.
 */
function accentVars(color: string | null | undefined): CSSProperties {
  const ink = domainColorValues(color).ink
  return {
    '--note-accent-light': ink,
    '--note-accent-dark': ink.replace('-700)', '-400)'),
  } as CSSProperties
}

/** Les ancêtres d'un savoir, du plus haut au plus proche. */
function ancestorsOf(skill: Skill, skills: Skill[]): Skill[] {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const chain: Skill[] = []
  const seen = new Set([skill.id])
  let parent = skill.parent_skill_id
    ? byId.get(skill.parent_skill_id)
    : undefined
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id)
    chain.unshift(parent)
    parent = parent.parent_skill_id
      ? byId.get(parent.parent_skill_id)
      : undefined
  }
  return chain
}
