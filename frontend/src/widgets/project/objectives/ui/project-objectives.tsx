import { Pencil, Plus } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { domainColor, domainColorValues, useDomain } from '@/entities/domain'
import { useDomainsMetrics, useProjectMetrics } from '@/entities/metric'
import {
  ObjectiveCheck,
  ObjectiveFrame,
  ObjectiveLabel,
  isProjectOpen,
  LearningCard,
  type Project,
  useUpdateProject,
  principalDomainId,
} from '@/entities/project'
import {
  AchievementCardEdit,
  AchievementCardRead,
} from '@/features/project/achievement'
import { ManualCard } from '@/features/project/manual'
import { ResultCardEdit, ResultCardRead } from '@/features/project/result'
import {
  TotalCardEdit,
  TotalCardRead,
  totalSentence,
  totalSignature,
} from '@/features/project/total'
import { ApiError } from '@/shared/api'
import { Button, FormSection, Textarea, toast } from '@/shared/ui'

import { LearningCardEdit } from './learning-card-edit'
import { type ObjectiveType, TypeChooserCard } from './type-chooser'

interface Draft {
  key: number
  type: ObjectiveType | null
}

/**
 * « Les objectifs » — ce à quoi le projet se déclare réussi (design #27).
 *
 * Quatre sortes de cartes, toujours dans cet ordre (design #36) : Total,
 * Apprentissage, Résultat, Réalisation. Sans aucun objectif, une seule carte « À la
 * main ». L'édition se fait **sur place** : le crayon ouvre la section,
 * « Terminer » la referme, chaque morceau s'écrit quand on le quitte.
 *
 * L'Apprentissage n'a pas de carte en édition : les savoirs visés se règlent
 * dans le plan du projet. Sauf à la création (design #33), où la section
 * est toujours en édition, sans son en-tête : la tuile Apprentissage y est
 * proposée une fois, et ouvre l'arbre du domaine que la page fournit.
 */
export function ProjectObjectives({
  project,
  create,
  preview = false,
  openResultId = null,
  onToggleResult,
}: {
  project: Project
  /** La création : toujours en édition, titre et aide de champ, Précisions en
   *  bas, et la tuile Apprentissage. */
  create?: {
    /** Ouvre l'arbre du domaine pour choisir les savoirs visés. */
    onChooseSkills: () => void
    /** Une carte neuve attend son type : l'étape ne se quitte pas. */
    onUntypedChange: (untyped: boolean) => void
  }
  /** Le résumé de la création : en lecture, sans crayon, rien ne s'y coche. */
  preview?: boolean
  /** Le Résultat dont le panneau des relevés est ouvert (design #43). */
  openResultId?: string | null
  /** Ouvre ou ferme le panneau des relevés d'un Résultat ; la page le monte. */
  onToggleResult?: (metricId: string) => void
}) {
  const { data: domain } = useDomain(principalDomainId(project))
  const { data: results } = useProjectMetrics(project.id)
  const { data: metrics } = useDomainsMetrics(project.domain_ids)
  const [editingState, setEditing] = useState(false)
  // Clos (design #32) : seul l'en-tête reste éditable — les objectifs se
  // lisent, chacun tenu ou raté.
  const closed = !isProjectOpen(project.status)
  const editing = Boolean(create) || (editingState && !closed && !preview)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const untyped = drafts.some((d) => d.type === null)
  const onUntypedChange = create?.onUntypedChange
  useEffect(() => {
    onUntypedChange?.(untyped)
  }, [untyped, onUntypedChange])
  // Les cartes neuves meurent avec la section : l'étape redevient libre.
  useEffect(() => () => onUntypedChange?.(false), [onUntypedChange])
  const update = useUpdateProject()
  const [precisions, setPrecisions] = useState(project.precisions ?? '')
  const color = domainColor(domain?.color)
  // Le « sur » d'un Total ne propose que les activités types **liées au
  // projet** (#37, §5) — celles de sa section « Activités ».
  const known = project.activity_types.map((link) => ({
    id: link.activity_type_id,
    title: link.title,
    emoji: link.emoji,
  }))
  const totals = [...project.totals].sort((a, b) => a.position - b.position)
  const links = results ?? []
  const achievements = project.achievements
  const hasLearning = project.learning.length > 0
  const learningDraft = drafts.some((d) => d.type === 'learning')
  const empty =
    totals.length === 0 &&
    links.length === 0 &&
    achievements.length === 0 &&
    !hasLearning

  function addDraft() {
    setEditing(true)
    setDrafts((prev) => [...prev, { key: Date.now(), type: null }])
  }
  const drop = (key: number) =>
    setDrafts((prev) => prev.filter((d) => d.key !== key))

  async function savePrecisions() {
    const next = precisions.trim() || null
    if (next === (project.precisions ?? null)) return
    try {
      await update.mutateAsync({
        id: project.id,
        body: { precisions: next },
      })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'enregistrement a échoué",
      )
    }
  }

  /** La phrase d'un autre Total qui compte exactement la même chose. */
  function duplicateOf(id: string): string | undefined {
    const me = totals.find((t) => t.id === id)
    if (!me) return undefined
    const other = totals.find(
      (t) => t.id !== id && totalSignature(t) === totalSignature(me),
    )
    return other ? totalSentence(other, known) : undefined
  }

  const grid = (
    <div
      className="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(272px,1fr))] gap-2.5"
      // Le résumé se lit : rien ne s'y coche avant que le projet existe
      // vraiment.
      inert={preview || undefined}
    >
      {editing ? (
        <>
          {create && empty && drafts.length === 0 && <ManualPlaceholder />}
          {totals.map((total) => (
            <TotalCardEdit
              key={total.id}
              project={project}
              total={total}
              activityTypes={known}
              duplicateOf={duplicateOf(total.id)}
            />
          ))}
          {create && hasLearning && !learningDraft && (
            <LearningCardEdit
              project={project}
              inkClassName={color.ink}
              dotClassName={color.dot}
              onChooseSkills={create.onChooseSkills}
            />
          )}
          {links.map((link) => (
            <ResultCardEdit
              key={link.metric_id}
              project={project}
              link={link}
              metrics={metrics ?? []}
              domainEmoji={domain?.emoji}
            />
          ))}
          {achievements.map((a) => (
            <AchievementCardEdit key={a.id} project={project} achievement={a} />
          ))}
          {drafts.map((d) =>
            d.type === 'total' ? (
              <TotalCardEdit
                key={d.key}
                project={project}
                activityTypes={known}
                onDiscard={() => drop(d.key)}
              />
            ) : d.type === 'result' ? (
              <ResultCardEdit
                key={d.key}
                project={project}
                metrics={metrics ?? []}
                domainEmoji={domain?.emoji}
                onDiscard={() => drop(d.key)}
              />
            ) : d.type === 'achievement' ? (
              <AchievementCardEdit
                key={d.key}
                project={project}
                onDiscard={() => drop(d.key)}
              />
            ) : d.type === 'learning' && create ? (
              <LearningCardEdit
                key={d.key}
                project={project}
                inkClassName={color.ink}
                dotClassName={color.dot}
                onChooseSkills={create.onChooseSkills}
                onDiscard={() => drop(d.key)}
              />
            ) : (
              <TypeChooserCard
                key={d.key}
                softClassName={color.soft}
                dotClassName={color.dot}
                ringClassName={color.ring}
                inkClassName={color.ink}
                // Une seule carte Apprentissage par projet.
                learning={Boolean(create) && !hasLearning && !learningDraft}
                onPick={(type) => {
                  setDrafts((prev) =>
                    prev.map((x) => (x.key === d.key ? { ...x, type } : x)),
                  )
                  if (type === 'learning') create?.onChooseSkills()
                }}
                onDiscard={() => drop(d.key)}
              />
            ),
          )}
        </>
      ) : empty ? (
        preview ? (
          <ManualPlaceholder />
        ) : (
          <ManualCard project={project} inkClassName={color.ink} />
        )
      ) : (
        <>
          {totals.map((total) => (
            <TotalCardRead
              key={total.id}
              total={total}
              activityTypes={known}
              project={project}
              ink={domainColorValues(domain?.color).ink}
              inkClassName={color.ink}
              barClassName={color.dot}
              closed={closed}
            />
          ))}
          {hasLearning && (
            <LearningCard
              project={project}
              inkClassName={color.ink}
              dotClassName={color.dot}
            />
          )}
          {links.map((link) => (
            <ResultCardRead
              key={link.metric_id}
              project={project}
              link={link}
              color={color}
              valuesOpen={openResultId === link.metric_id}
              onToggleValues={
                onToggleResult && (() => onToggleResult(link.metric_id))
              }
              ink={domainColorValues(domain?.color).ink}
            />
          ))}
          {achievements.map((a) => (
            <AchievementCardRead
              key={a.id}
              achievement={a}
              inkClassName={color.ink}
              softClassName={color.soft}
              hoverClassName={color.softHover}
              closed={closed}
            />
          ))}
        </>
      )}
      {editing && (
        <button
          type="button"
          onClick={addDraft}
          aria-label="Ajouter un objectif"
          className="grid min-h-24 place-items-center rounded-[10px] border-[1.5px] border-dashed border-border text-muted-foreground/60 transition-colors hover:border-muted-foreground hover:text-foreground"
        >
          <Plus className="size-[22px]" />
        </button>
      )}
    </div>
  )

  // La création : un champ titré au-dessus des cartes, Précisions en bas —
  // les mêmes cartes que la page en édition (design #33).
  if (create)
    return (
      <>
        <FormSection
          title="Objectifs"
          hint="Ce qui valide le projet. Sans objectif, il se déclare réussi à la main."
        >
          {grid}
        </FormSection>
        <FormSection
          title="Précisions"
          hint="Ce qui compte vraiment pour dire que c'est réussi."
        >
          <Textarea
            rows={2}
            value={precisions}
            placeholder={OBJECTIVES_PLACEHOLDER}
            aria-label="Précisions"
            onChange={(e) => setPrecisions(e.target.value)}
            onBlur={() => void savePrecisions()}
          />
        </FormSection>
      </>
    )

  return (
    <section className="group/section">
      <div className="mb-3.5 flex items-center gap-2.5">
        <h3 className="font-heading text-sm font-semibold">Les objectifs</h3>
        {editing ? (
          <Button
            size="sm"
            className="-my-1 ml-auto h-7 px-2.5 text-xs font-semibold"
            onClick={() => {
              setEditing(false)
              setDrafts([])
            }}
          >
            Terminer
          </Button>
        ) : (
          !closed &&
          !preview && (
            <button
              type="button"
              onClick={() => {
                setPrecisions(project.precisions ?? '')
                setEditing(true)
              }}
              aria-label="Ajuster les objectifs"
              className="-my-[3px] -ml-1 grid size-[26px] place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
            >
              <Pencil className="size-[15px]" />
            </button>
          )
        )}
      </div>

      {/* La réussite en clair : ce que les cartes ne disent pas en chiffres. */}
      {editing ? (
        <textarea
          rows={1}
          value={precisions}
          placeholder={OBJECTIVES_PLACEHOLDER}
          aria-label="Réussite"
          onChange={(e) => setPrecisions(e.target.value)}
          onBlur={() => void savePrecisions()}
          className="-mt-2 mb-3 -ml-[9px] block field-sizing-content min-h-[30px] w-full max-w-[680px] resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] leading-[1.55] text-muted-foreground outline-none transition-colors hover:border-border focus:border-ring focus:bg-card focus:text-foreground focus:ring-3 focus:ring-ring/20"
        />
      ) : (
        project.precisions && (
          <p className="-mt-2 mb-3 max-w-[680px] border border-transparent py-1 text-[13px] leading-[1.55] whitespace-pre-line text-pretty text-muted-foreground">
            {project.precisions}
          </p>
        )
      )}

      {grid}
    </section>
  )
}

const OBJECTIVES_PLACEHOLDER = "C'est quoi, réussi ?"

/**
 * « À la main » tant que rien ne se coche : à la création et dans son résumé,
 * le projet n'existe pas encore pour de bon — pas d'interrupteur.
 */
function ManualPlaceholder(): ReactNode {
  return (
    <ObjectiveFrame>
      <div className="flex items-center gap-[9px]">
        <ObjectiveCheck done={false} inkClassName="" />
        <ObjectiveLabel>À la main</ObjectiveLabel>
      </div>
      <p className="text-[13px]">Le projet se déclare réussi à la main</p>
    </ObjectiveFrame>
  )
}
