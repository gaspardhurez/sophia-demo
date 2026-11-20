import { Flag, List, Network, Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { type DomainColorClasses, domainColorValues } from '@/entities/domain'
import { useActivityTypes } from '@/entities/activity-type'
import { useProjectMetrics } from '@/entities/metric'
import {
  ObjectiveCheck,
  currentStep,
  ISSUE_META,
  IssueRing,
  type Project,
  type ProjectIssue,
  projectIssue,
} from '@/entities/project'
import { toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { Button, FormSection, shortDay } from '@/shared/ui'

import { OutOfSequence } from './out-of-sequence'
import { Mosaic, type PlanSkill, SkillRow } from './plan-skills'
import { Gutter, PlanStep } from './plan-step'
import { PlanStepsEdit } from './plan-steps-edit'
import { SequenceEdit } from './sequence-edit'

/**
 * « Le plan » (design #27) : les étapes et les savoirs, et seulement eux — les
 * cibles vivent dans les objectifs. Toujours présent, encadré par le début et
 * l'échéance du projet. Les savoirs se lisent dans l'ordre de la séquence,
 * chaque étape en porte sa coupe ; sans étapes, une carte « Savoirs » à plat.
 * Ce que la séquence ne range pas se liste depuis l'en-tête, « hors séquence ».
 *
 * La vue Carte montre l'arbre du domaine — fourni par la page, un widget n'en
 * important pas un autre.
 *
 * L'onglet Apprentissage (ex-Savoirs, #83) dit le quand avant le quoi : les
 * créneaux d'apprentissage de la semaine type, puis l'arbre et la séquence.
 *
 * À la création (design #33), le plan est toujours en édition : ni titre de
 * section ni « Terminer », la bascule Étapes · Apprentissage en tête et, sous elle,
 * le titre et l'aide de la vue.
 */
export function ProjectPlan({
  project,
  color,
  colorKey,
  emoji,
  onEditingChange,
  onOpenSkill,
  renderTree,
  create,
  preview = false,
}: {
  project: Project
  color: DomainColorClasses
  /** La clé de couleur du domaine, pour ce qui se peint. */
  colorKey?: string | null
  emoji?: string | null
  /** Le plan passe en édition : la page retire sa colonne de droite, comme la
   *  maquette, pour lui laisser toute la largeur. */
  onEditingChange?: (editing: boolean) => void
  /** En lecture, un clic sur un savoir l'ouvre dans le panneau de la page. */
  onOpenSkill?: (skillId: string) => void
  /** La carte des savoirs — `read` pour la vue Carte, `edit` pour l'onglet
   *  Apprentissage ; elle signale son mode rattachement, qui estompe la
   *  séquence. */
  renderTree: (
    mode: 'read' | 'edit',
    onAttachModeChange?: (on: boolean) => void,
  ) => ReactNode
  /** La création : l'édition forcée, sur la vue que la page tient (la modale
   *  s'élargit pour l'Apprentissage). */
  create?: {
    view: 'steps' | 'skills'
    onViewChange: (view: 'steps' | 'skills') => void
    /** Une étape a perdu son titre : l'étape de création ne se quitte pas. */
    onBlankTitleChange: (blank: boolean) => void
  }
  /** Le résumé de la création : en lecture, sans crayon, tout replié. */
  preview?: boolean
}) {
  const [view, setView] = useState<'list' | 'map'>('list')
  // En édition, les actions se posent en tête de section : elles commandent
  // tout le bloc, dont les vues qui n'ont pas la même hauteur.
  const [editingState, setEditing] = useState<'steps' | 'skills' | null>(null)
  // Clos (design #32) : seul l'en-tête reste éditable — le plan se lit.
  const issue = projectIssue(project.status)
  const editing = create ? create.view : issue || preview ? null : editingState
  const setEditingView = (view: 'steps' | 'skills') =>
    create ? create.onViewChange(view) : setEditing(view)
  useEffect(
    () => onEditingChange?.(editing !== null),
    [editing, onEditingChange],
  )
  const [open, setOpen] = useState<Record<string, boolean>>({})
  // Survol d'un bouton inactif de la bascule : relief et encre du domaine.
  // Par l'état, pas par `hover:` — une classe de domaine ne se compose pas.
  // `rail` : la bascule est survolée, hors de ses boutons.
  const [railHover, setRailHover] = useState<'list' | 'map' | 'rail' | null>(
    null,
  )
  // Le crayon se retire tant qu'on vise un autre contrôle de l'en-tête.
  const [outHover, setOutHover] = useState(false)
  const [outOpen, setOutOpen] = useState(false)
  const pencilHidden = railHover !== null || outHover || outOpen
  const [attachMode, setAttachMode] = useState(false)
  // Toutes : le plan les retrouve par id, quel que soit leur domaine (#203).
  const { data: activityTypes } = useActivityTypes()
  const { data: results } = useProjectMetrics(project.id)
  const today = toDateISO(new Date())

  const skills: PlanSkill[] = project.learning
  const ranked = skills.filter((s) => s.position !== null)
  const unranked = skills.filter((s) => s.position === null)
  const steps = [...project.steps].sort((a, b) => a.order - b.order)
  // Clos : plus d'étape en cours, donc aucune ne s'ouvre d'elle-même.
  // Le résumé se lit replié : aucune ne s'ouvre d'elle-même non plus.
  const current = issue || preview ? null : currentStep(project, today)
  // Liste · Carte : dès que le plan a des étapes ou un savoir visé. La
  // maquette la réservait aux étapes et à la séquence, ce qui privait de leur
  // carte les projets aux savoirs tous hors séquence (retour du user).
  const hasPlan = steps.length > 0 || skills.length > 0

  const viewToggle = (
    <div
      className={cn(
        'flex gap-0.5 rounded-lg bg-muted p-[3px]',
        create && 'self-start',
      )}
    >
      {(
        [
          ['steps', 'Étapes'],
          ['skills', 'Apprentissage'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={editing === key}
          onClick={() => setEditingView(key)}
          className={cn(
            'h-6 rounded-md px-2.5 text-xs font-semibold',
            editing === key
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const editBody =
    editing === 'steps' ? (
      <PlanStepsEdit
        project={project}
        results={results ?? []}
        activityTypes={activityTypes ?? []}
        color={color}
        onBlankTitleChange={create?.onBlankTitleChange}
      />
    ) : (
      <div className="flex flex-col">
        {renderTree('edit', setAttachMode)}
        <SequenceEdit
          project={project}
          color={color}
          values={domainColorValues(colorKey)}
          emoji={emoji}
          dimmed={attachMode}
        />
      </div>
    )

  if (create)
    return (
      <>
        {viewToggle}
        <FormSection
          title={editing === 'skills' ? 'Apprentissage' : 'Étapes'}
          hint={
            editing === 'skills'
              ? "L'ordre dans lequel les acquérir, et leur place dans les étapes."
              : 'Pour découper le projet en paliers plus proches, chacun avec sa part des objectifs.'
          }
        >
          {editBody}
        </FormSection>
      </>
    )

  return (
    <section className="group/plan grid grid-cols-[minmax(0,1fr)] gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="font-heading text-sm font-semibold">Le plan</h3>
        {editing ? (
          viewToggle
        ) : (
          <>
            {hasPlan && (
              <div
                onMouseEnter={() => setRailHover('rail')}
                onMouseLeave={() => setRailHover(null)}
                className="flex items-center gap-0.5 rounded-[7px] bg-muted p-0.5"
              >
                {(
                  [
                    ['list', 'Liste', List],
                    ['map', 'Carte', Network],
                  ] as const
                ).map(([key, title, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    title={title}
                    aria-pressed={view === key}
                    onClick={() => setView(key)}
                    onMouseEnter={() => setRailHover(key)}
                    onMouseLeave={() => setRailHover('rail')}
                    className={cn(
                      'grid h-6 w-[26px] place-items-center rounded-[5px] transition',
                      view === key
                        ? 'bg-card text-foreground shadow-[0_1px_2px_0_color-mix(in_oklab,var(--color-foreground)_14%,transparent)]'
                        : railHover === key
                          ? cn('-translate-y-px', color.text)
                          : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
            )}
            {!issue && !preview && (
              <button
                type="button"
                onClick={() => setEditing('steps')}
                aria-label="Ajuster le plan"
                className={cn(
                  '-my-[3px] -ml-1 grid size-[26px] place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100',
                  !pencilHidden && 'group-hover/plan:opacity-100',
                )}
              >
                <Pencil className="size-[15px]" />
              </button>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold"
              onClick={() => setEditing(null)}
            >
              Terminer
            </Button>
          ) : (
            <OutOfSequence
              projectId={project.id}
              skills={unranked}
              emoji={emoji}
              color={color}
              onHoverChange={setOutHover}
              onOpenChange={setOutOpen}
              onOpenSkill={onOpenSkill}
            />
          )}
        </div>
      </div>

      {editing ? (
        editBody
      ) : view === 'map' ? (
        renderTree('read')
      ) : (
        <div className="flex flex-col">
          <Bound label="Début" date={project.start_at} first />
          {steps.map((step) => {
            const isCurrent = current?.id === step.id
            const stepSkills = ranked.filter((s) =>
              step.skill_ids.includes(s.skill_id),
            )
            return (
              <PlanStep
                key={step.id}
                project={project}
                step={step}
                skills={stepSkills}
                results={results ?? []}
                activityTypes={activityTypes ?? []}
                current={isCurrent}
                expanded={open[step.id] ?? isCurrent}
                onToggle={() =>
                  setOpen((o) => ({
                    ...o,
                    [step.id]: !(o[step.id] ?? isCurrent),
                  }))
                }
                color={color}
                ink={domainColorValues(colorKey).ink}
                emoji={emoji}
                today={today}
                projectIssue={issue}
                onOpenSkill={onOpenSkill}
              />
            )
          })}
          {steps.length === 0 && ranked.length > 0 && (
            <FlatSequence
              projectId={project.id}
              skills={ranked}
              color={color}
              emoji={emoji}
              onOpenSkill={onOpenSkill}
            />
          )}
          <Bound
            label="Fin"
            // Sans fin prévue (#196) : la fin constatée, une fois clos.
            date={project.due_at ?? project.ended_at}
            issue={issue}
          />
        </div>
      )}
    </section>
  )
}

/**
 * Une borne du fil : « Début » ou « Fin », sans cadre, étroite. La date en
 * tête, le libellé après en petites capitales. Un projet clos remplace le
 * drapeau de Fin par son anneau d'issue, et « Fin » par l'issue (design #32).
 */
function Bound({
  label,
  date,
  first,
  issue,
}: {
  label: string
  date: string | null
  first?: boolean
  issue?: ProjectIssue | null
}) {
  return (
    <div className="flex min-w-0 gap-3.5">
      <Gutter line={first ? 'top-4 bottom-0' : 'top-0 h-4'}>
        {issue ? (
          <IssueRing issue={issue} size="bound" className="relative" />
        ) : (
          <span className="relative grid size-7 shrink-0 place-items-center rounded-full border bg-muted/40">
            {first ? (
              <span className="size-[7px] rounded-full bg-muted-foreground/50" />
            ) : (
              <Flag className="size-[13px] text-muted-foreground" />
            )}
          </span>
        )}
      </Gutter>
      <div className={cn('flex min-w-0 flex-1', first && 'pb-[18px]')}>
        <div className="flex h-8 flex-wrap content-center items-baseline gap-x-2.5 px-3">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {date ? shortDay(date) : '—'}
          </span>
          <span
            className={cn(
              'font-heading text-[11px] font-semibold tracking-[.06em] uppercase',
              issue ? ISSUE_META[issue].text : 'text-muted-foreground',
            )}
          >
            {issue ? ISSUE_META[issue].label : label}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Sans étapes : une carte « Savoirs », l'objectif en tête, la séquence dessous. */
function FlatSequence({
  projectId,
  skills,
  color,
  emoji,
  onOpenSkill,
}: {
  projectId: string
  skills: PlanSkill[]
  color: DomainColorClasses
  emoji?: string | null
  onOpenSkill?: (skillId: string) => void
}) {
  const acquired = skills.filter((s) => s.level >= 4).length
  return (
    <div className="flex min-w-0 gap-3.5">
      <Gutter>
        <span />
      </Gutter>
      <div className="min-w-0 flex-1 pb-[18px]">
        <div className="overflow-hidden rounded-[10px] border bg-card shadow-xs">
          <div className="flex min-h-9 items-center gap-2.5 border-b border-border/70 px-3.5 py-2">
            <ObjectiveCheck
              done={acquired === skills.length}
              inkClassName={color.ink}
            />
            <span className="w-24 shrink-0 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
              Apprentissage
            </span>
            <div className="min-w-10 flex-1">
              <Mosaic skills={skills} color={color} />
            </div>
            <span className="flex shrink-0 items-baseline gap-[5px] tabular-nums">
              <span className="font-heading text-sm leading-none font-semibold">
                {acquired}
              </span>
              <span className="text-[13px] leading-none text-muted-foreground">
                / {skills.length} savoir{skills.length > 1 ? 's' : ''}
              </span>
            </span>
          </div>
          <div className="grid px-2 py-1.5">
            {skills.map((s) => (
              <SkillRow
                key={s.skill_id}
                skill={s}
                emoji={emoji}
                color={color}
                projectId={projectId}
                onOpen={onOpenSkill}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
