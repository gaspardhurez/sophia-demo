import { Check, Pencil, Play, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import {
  CounterChip,
  DomainBadges,
  domainColor,
  domainColorValues,
  useDomains,
  useDomainsOf,
} from '@/entities/domain'
import {
  ISSUE_META,
  IssueRing,
  isProjectOpen,
  projectIssue,
  PERIOD_HINT,
  ProjectEmojiPicker,
  projectEmoji,
  periodEffects,
  type Project,
  ProjectStateChip,
  type ProjectStatus,
  useProjectCounters,
  useUpdateProject,
} from '@/entities/project'
import { useProjectMetrics } from '@/entities/metric'
import { AbandonProjectDialog } from '@/features/project/abandon'
import { DeleteProjectDialog } from '@/features/project/delete'
import { ProjectDomainsEditor } from '@/features/project/edit-domains'
import {
  defaultTracked,
  isTracked,
  TrackingChips,
  trackingChips,
} from '@/features/project/tracking'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  FormSection,
  Input,
  PeriodPicker,
  shortDay,
  Textarea,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui'

import { TrackingBar } from './tracking-bar'

interface ProjectHeaderProps {
  project: Project
  domain?: { emoji: string | null; color: string | null }
  onDeleted?: () => void
  /** Le résumé de la création (design #33) : en lecture, sans crayon. */
  preview?: boolean
}

/**
 * « 21 sept. → 31 déc. · 100 jours restants » — la période, et ce qu'il en
 * reste tant que le projet court. Sans fin prévue (#196) : « Depuis le
 * 28 sept. » tant qu'il court, puis jusqu'à sa fin constatée.
 */
function periodLabel(project: Project, today: string): string | null {
  const { start_at: start } = project
  const due = project.due_at ?? project.ended_at
  if (!due) return `Depuis le ${formatDateShort(start)}`
  const period =
    start && due
      ? `${formatDateShort(start)} → ${formatDateShort(due)}`
      : due
        ? `→ ${formatDateShort(due)}`
        : `dès ${formatDateShort(start!)}`
  if (!due || due < today || !isProjectOpen(project.status)) return period
  const days = Math.round(
    (Date.parse(`${due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) /
      86_400_000,
  )
  const rest =
    days === 0
      ? 'dernier jour'
      : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`
  return `${period} · ${rest}`
}

/**
 * L'en-tête d'un projet (design #27) : qui il est, et **un** objectif suivi.
 *
 * Le suivi (design #34, #36) : une chip par objectif, la barre en pied suit la
 * chip choisie — par défaut la première de `progressLines`, l'objectif en
 * tête. Le choix n'est pas retenu : à la visite suivante, c'est de nouveau
 * l'objectif qui mérite l'attention. La barre court sur toute la largeur — et
 * reste là, vide, quand rien n'est suivi.
 *
 * L'en-tête est le haut blanc de la carte que la page monte autour de lui : il
 * n'a ni bord ni ombre à lui.
 *
 * L'édition se fait sur place et ne porte que ce qui se lit ici : titre,
 * description, période. Les objectifs se règlent dans leur section, le plan
 * dans le sien.
 */
export function ProjectHeader({
  project,
  domain,
  onDeleted = () => {},
  preview = false,
}: ProjectHeaderProps) {
  const update = useUpdateProject()
  const color = domainColor(domain?.color)

  const [editing, setEditing] = useState(false)
  const { data: allDomains } = useDomains()
  const projectDomains = useDomainsOf(project.domain_ids)
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description ?? '')
  const [emoji, setEmoji] = useState(project.emoji)
  const [startAt, setStartAt] = useState(project.start_at ?? '')
  const [dueAt, setDueAt] = useState(project.due_at ?? '')
  const { data: results } = useProjectMetrics(project.id)
  const { data: counters } = useProjectCounters(project.id)

  const today = toDateISO(new Date())
  const period = periodLabel(project, today)
  // Clos (design #32) : la tuile dit l'issue, sans chip ni pastille.
  const issue = projectIssue(project.status)
  // Le suivi (design #34) : une chip par objectif, la barre suit la choisie.
  const chips = trackingChips(project, results ?? [])
  const [picked, setPicked] = useState<string | null>(null)
  const tracked = chips.filter(isTracked)
  const selectedId =
    (picked && tracked.some((c) => c.id === picked) && picked) ||
    defaultTracked(project, chips, today)
  const selected = tracked.find((c) => c.id === selectedId)

  function startEdit() {
    setTitle(project.title)
    setEmoji(project.emoji)
    setDescription(project.description ?? '')
    setStartAt(project.start_at ?? '')
    setDueAt(project.due_at ?? '')
    setEditing(true)
  }

  async function onSave() {
    // Le début est obligatoire (design #32) ; sans fin, le projet n'en a
    // pas (#196). Le sélecteur ne rend une plage qu'une fois choisie.
    if (!title.trim() || !startAt) return
    try {
      await update.mutateAsync({
        id: project.id,
        body: {
          title: title.trim(),
          emoji,
          description: description.trim() || null,
          start_at: startAt,
          due_at: dueAt || null,
        },
      })
      setEditing(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
    }
  }

  async function setStatus(status: ProjectStatus, message: string) {
    try {
      await update.mutateAsync({ id: project.id, body: { status } })
      toast.success(message)
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  // Réussi garde sa couleur ; Raté et Abandonné s'éteignent — fond muted,
  // emoji en gris (maquette prod/Projet, tweak « issue »).
  const off = issue === 'failed' || issue === 'abandoned'
  const emojiChip = (className?: string) => (
    <span
      aria-hidden
      className={cn(
        'relative grid size-9 shrink-0 place-items-center rounded-[10px] border text-xl',
        off ? 'bg-muted' : color.soft,
        className,
      )}
    >
      <span className={cn(off && 'opacity-55 grayscale')}>
        {projectEmoji(project, domain?.emoji)}
      </span>
      {issue && (
        <IssueRing
          issue={issue}
          size="tile"
          className="absolute -right-[5px] -bottom-[5px] shadow-[0_0_0_2px_var(--color-card)]"
        />
      )}
    </span>
  )
  const issueLabel =
    issue &&
    // La fin de la période fait foi : pour dater l'issue autrement, on
    // déplace la fin (choix du user, #32). Sans fin prévue, celle constatée.
    `${ISSUE_META[issue].label} le ${formatDateShort((project.due_at ?? project.ended_at)!)}`

  // Un projet sans fin prévue encore ouvert se clôt à la main (#197).
  const closable = !project.due_at && isProjectOpen(project.status)
  const validate = (height: string) => (
    <Button
      variant="ghost"
      className={cn(
        height,
        'bg-emerald-500/12 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/22 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-300',
      )}
      onClick={() => setStatus('achieved', 'Projet validé')}
    >
      <Check className="size-3.5" strokeWidth={2.5} /> Valider
    </Button>
  )

  if (editing) {
    const muted = 'h-8 px-2.5 text-xs font-semibold'
    return (
      <section className="grid gap-3.5 rounded-t-xl bg-card px-6 py-5">
        <div className="flex items-center gap-3">
          {/* Son emoji, choisi ici ; retiré, celui du domaine principal. */}
          <ProjectEmojiPicker
            value={emoji}
            fallback={domain?.emoji}
            className={color.soft}
            onChange={setEmoji}
          />
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre du projet"
            aria-label="Titre du projet"
            className="h-10 flex-1 font-heading text-lg font-semibold tracking-[-0.01em]"
          />
        </div>
        {/* Les domaines (#203) s'enregistrent aussitôt : retirer confirme
            ce qui se délie. */}
        <ProjectDomainsEditor project={project} domains={allDomains ?? []} />

        <FormSection
          title="Description"
          hint="Ce que recouvre ce projet."
          className="max-w-[720px]"
        >
          <Textarea
            rows={2}
            aria-label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormSection>

        <FormSection
          title={
            <>
              Période
              <span aria-hidden className="ml-0.5">
                *
              </span>
            </>
          }
          hint={PERIOD_HINT}
          className="max-w-[720px]"
        >
          <PeriodPicker
            aria-label="Période"
            allowNoEnd
            start={startAt || null}
            end={dueAt || null}
            onChange={(s, e) => {
              setStartAt(s ?? '')
              setDueAt(e ?? '')
            }}
            taken={project.steps.flatMap((step) =>
              step.start_at && step.due_at
                ? [
                    {
                      start: step.start_at,
                      end: step.due_at,
                      label: step.title,
                    },
                  ]
                : [],
            )}
            effects={(s, e) => periodEffects(project, s, e, shortDay)}
          />
        </FormSection>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {closable && validate('h-8')}
          {/* Abandonner tant que le projet est ouvert ; un abandon se
              reprend, sans modale : le statut se recalcule — Raté si la fin
              est passée, le temps de la repousser (design #32). */}
          {project.manual_status === 'abandoned' ? (
            <Button
              variant="outline"
              className={muted}
              onClick={() => setStatus('todo', 'Projet repris')}
            >
              <Play className="size-3.5 fill-current" /> Reprendre
            </Button>
          ) : (
            isProjectOpen(project.status) && (
              <AbandonProjectDialog
                project={project}
                trigger={
                  <Button
                    variant="ghost"
                    className={cn(
                      muted,
                      'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive',
                    )}
                  >
                    <X className="size-3.5" /> Abandonner
                  </Button>
                }
              />
            )
          )}
          <DeleteProjectDialog
            project={project}
            onDeleted={onDeleted}
            trigger={
              <Button
                variant="ghost"
                className={cn(
                  muted,
                  'text-destructive hover:bg-destructive/10 hover:text-destructive',
                )}
              >
                <Trash2 className="size-3.5" /> Supprimer
              </Button>
            }
          />
          <Button
            variant="outline"
            className={cn(muted, 'ml-auto')}
            onClick={() => setEditing(false)}
          >
            Annuler
          </Button>
          <Button
            className={muted}
            onClick={() => void onSave()}
            isPending={update.isPending}
          >
            Enregistrer
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="group/head rounded-t-xl bg-card">
      {/* 24 px entre le suivi et la barre, pour tous les objectifs : l'espace
          où le fil d'un Résultat pose ses repères est réservé, les chips ne
          bougent pas quand on change d'objectif suivi (design #36 ; maquette :
          gap 14, espace réservé 14, marge −4). */}
      <div className="grid gap-3.5 px-6 pt-5 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          {issueLabel ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mt-0.5 shrink-0" title={issueLabel}>
                  {emojiChip()}
                  <span className="sr-only">{issueLabel}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{issueLabel}</TooltipContent>
            </Tooltip>
          ) : (
            emojiChip('mt-0.5')
          )}
          <h1 className="font-heading text-[22px] leading-none font-semibold tracking-[-0.02em]">
            {project.title}
          </h1>
          {/* Sans fin prévue (#196) : ni pastille d'état ni rythme. */}
          {!issue && project.due_at && (
            <ProjectStateChip
              project={project}
              today={today}
              showNotStarted
              ink={domainColorValues(domain?.color).ink}
              className="mt-0.5"
            />
          )}
          {period && (
            <span className="mt-0.5 text-[13px] leading-none text-muted-foreground tabular-nums">
              {period}
            </span>
          )}
          <DomainBadges domains={projectDomains} className="mt-0.5" />
          {/* Sans fin prévue, objectifs tous remplis (#197) : l'app constate,
              c'est l'utilisateur qui clôt. Pas de bannière ni de relance. */}
          {closable && project.is_tracked && project.targets_met && (
            <span className="mt-0.5 inline-flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Objectifs remplis
              </span>
              {!preview && validate('h-7')}
            </span>
          )}
          {!preview && (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Éditer le projet"
              className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
            >
              <Pencil className="size-4" />
            </button>
          )}
        </div>

        {project.description && (
          <p className="max-w-[720px] text-[13px] leading-normal whitespace-pre-line text-pretty text-muted-foreground">
            {project.description}
          </p>
        )}

        <TrackingChips
          chips={chips}
          selected={selectedId}
          onSelect={setPicked}
          color={color}
          ink={domainColorValues(domain?.color).ink}
          before={counters?.map((counter) => (
            <CounterChip
              key={counter.unit?.id ?? 'hours'}
              counter={counter}
              colorKey={domain?.color}
              hint="Pendant le projet"
              className="px-2 font-medium"
            />
          ))}
        />
      </div>
      <TrackingBar chip={selected} color={color} />
    </section>
  )
}
