import {
  CalendarDays,
  Check,
  Compass,
  Mic,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type Domain, domainColor } from '@/entities/domain'
import { hasCompleteQuestion, type Notes } from '@/entities/note'
import {
  type AcquisitionPlan,
  recallLaunched,
  useValidateStudy,
} from '@/entities/plan'
import type { Skill } from '@/entities/skill'
import { PlanActivityDialog } from '@/features/activity/plan'
import { useLaunchTest } from '@/features/plan/launch-test'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast, Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import { useCompanionAction } from '../../model/use-companion-action'
import { GROUP_LABEL, ROW_HOVER, ROW_SELECTED } from './styles'

/** Le motif de « Cadrer l'étude » sans cycle : le cadrage écrit dans le
 *  cycle (intention, périmètre, ressources). */
const NO_CYCLE = 'Pas de cycle à cadrer : ouvre-en un depuis la page du savoir.'

/**
 * « Actions », en bas de la colonne des notes (#173, `prod/Notes`) — ce que
 * l'étude fait depuis ses notes :
 *
 * - **Cadrer l'étude** (#175), en tête, toujours là : la modale du même
 *   nom, sur le cycle de la colonne ; enfoncée tant qu'elle est ouverte.
 *   Sans cycle, grisée avec son motif (il n'y a rien où écrire).
 * - **Dicter** : au curseur, dans les notes ou la ressource ouverte
 *   (`useDictation`) ; un second clic pendant qu'on parle l'arrête.
 *   Enfoncée tant que la dictée enregistre ou se nettoie. Indisponible
 *   (compagnon absent, aucun curseur dans un éditeur) : grisée, le motif
 *   en infobulle (#173, 29/10).
 * - **Vérifier les notes** : seulement sur une ressource ouverte (29/10),
 *   qu'elle vérifie ; enfoncée tant que Sophia relit ou attend un passage
 *   collé. Indisponible (pas de clé, notes vides) : grisée, le motif en
 *   infobulle.
 * - **Préparer les questions** : la vue du même nom à la place des notes
 *   (`?vue=questions`) ; choisie, elle est sur fond, et un second clic
 *   ramène aux notes.
 * - **Planifier une séance** : la modale Planifier de l'app, l'**Étude**
 *   imposée (« Sur quoi » ne propose qu'elle), au service du cycle s'il
 *   n'est pas clos.
 * - **Lancer l'interro** : la modale du même nom (`useLaunchTest`) ;
 *   grisée une fois l'interro lancée. Sans question complète, **Valider
 *   l'étude** à la place (une étude sans questions se valide à la main),
 *   puis « Étude validée », grisée. Ni l'une ni l'autre hors d'un cycle
 *   en cours (le serveur refuse) : grisées sur un cycle prévu ou clos,
 *   absentes sans cycle.
 */
export function ColumnActions({
  skill,
  domain,
  plan,
  notes,
  dictation,
  review,
  framing,
  onFrame,
  questionsActive,
  onQuestions,
}: {
  skill: Skill
  domain: Domain | undefined
  plan: AcquisitionPlan | null
  notes: Notes
  dictation: {
    active: boolean
    /** Rien où dicter (aucun curseur dans un éditeur) : le motif. */
    unavailable: string | null
    onDictate: () => void
  }
  /** Nul hors d'une ressource ouverte : l'action n'est pas montrée. */
  review: {
    active: boolean
    /** Rien à vérifier (notes vides) : le motif. */
    unavailable: string | null
    onReview: () => void
  } | null
  framing: boolean
  onFrame: () => void
  questionsActive: boolean
  onQuestions: () => void
}) {
  const [planning, setPlanning] = useState(false)
  const accent = domainColor(domain?.color)
  const emoji = domain?.emoji ?? ''
  const open = plan?.state === 'active'
  const closed = plan?.state === 'completed' || plan?.state === 'abandoned'
  const dictationStatus = useCompanionAction('dictation')
  const dictateOff = !dictationStatus.available
    ? (dictationStatus.reason ?? '')
    : dictation.unavailable
  const reviewStatus = useCompanionAction('review')
  const reviewOff = !reviewStatus.available
    ? (reviewStatus.reason ?? '')
    : (review?.unavailable ?? null)

  return (
    <div className="flex flex-col gap-px">
      <div className="flex h-6 items-center px-2">
        <span className={GROUP_LABEL}>Actions</span>
      </div>
      <Action
        icon={<Compass className="size-[15px]" />}
        active={framing}
        disabled={!plan}
        reason={plan ? undefined : NO_CYCLE}
        onClick={onFrame}
      >
        Cadrer l'étude
      </Action>
      <Action
        icon={<Mic className="size-[15px]" />}
        active={dictation.active}
        disabled={dictateOff !== null}
        reason={dictateOff || undefined}
        onClick={dictation.onDictate}
      >
        Dicter
      </Action>
      {review && (
        <Action
          icon={<ShieldCheck className="size-[15px]" />}
          active={review.active}
          disabled={reviewOff !== null}
          reason={reviewOff || undefined}
          onClick={review.onReview}
        >
          Vérifier les notes
        </Action>
      )}
      <Action
        icon={
          <span className="grid size-[15px] place-items-center rounded-full border-[1.8px] border-current text-[9px] font-extrabold">
            ?
          </span>
        }
        active={questionsActive}
        onClick={onQuestions}
      >
        Préparer les questions
      </Action>
      <Action
        icon={<CalendarDays className="size-[15px]" />}
        active={planning}
        disabled={!domain}
        onClick={() => setPlanning(true)}
      >
        Planifier une séance
      </Action>
      {plan && (
        <StudyAction
          plan={plan}
          open={open}
          hasQuestions={hasCompleteQuestion(notes)}
          domain={domain}
        />
      )}
      {planning && domain && (
        <PlanActivityDialog
          skillId={skill.id}
          skillName={skill.name}
          domainId={domain.id}
          accent={accent}
          domainEmoji={emoji}
          piece="study"
          projectIds={plan?.project_ids ?? []}
          planId={plan && !closed ? plan.id : undefined}
          onOpenChange={(o) => !o && setPlanning(false)}
        />
      )}
    </div>
  )
}

/** Lancer l'interro, ou Valider l'étude sans interro quand il n'y a pas de questions. */
function StudyAction({
  plan,
  open,
  hasQuestions,
  domain,
}: {
  plan: AcquisitionPlan
  open: boolean
  hasQuestions: boolean
  domain: Domain | undefined
}) {
  const validate = useValidateStudy()
  const launch = useLaunchTest({
    plan,
    domainId: domain?.id,
    domainEmoji: domain?.emoji ?? '',
    tintClassName: domainColor(domain?.color).soft,
  })

  if (plan.study_validated_at || !hasQuestions) {
    const validated = plan.study_validated_at != null
    return (
      <Action
        icon={<Check className="size-[15px]" strokeWidth={2.5} />}
        disabled={validated || !open || validate.isPending}
        onClick={() =>
          validate
            .mutateAsync(plan.id)
            .catch((err) =>
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : "L'étude n'a pas pu se valider",
              ),
            )
        }
      >
        {validated ? 'Étude validée' : "Valider l'étude sans interro"}
      </Action>
    )
  }
  return (
    <>
      <Action
        icon={<Play className="size-[15px]" fill="currentColor" />}
        active={launch.dialog !== null}
        disabled={recallLaunched(plan) || !open || launch.isPending}
        onClick={launch.open}
      >
        Lancer l'interro
      </Action>
      {launch.dialog}
    </>
  )
}

/**
 * Une action : 30 px, l'icône dans une case de 20 px, le libellé.
 * Grisée avec un motif (`reason`), elle reste focalisable
 * (`aria-disabled`) pour que le survol et le focus montrent l'infobulle.
 */
function Action({
  icon,
  active = false,
  disabled = false,
  reason,
  onClick,
  children,
}: {
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  reason?: string
  onClick: () => void
  children: ReactNode
}) {
  const explained = disabled && !!reason
  const button = (
    <button
      type="button"
      onClick={() => !disabled && onClick()}
      disabled={disabled && !explained}
      aria-disabled={disabled || undefined}
      aria-pressed={active}
      className={cn(
        'flex h-[30px] cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium aria-disabled:cursor-default aria-disabled:opacity-40',
        active ? ROW_SELECTED : !disabled && ROW_HOVER,
      )}
    >
      <span
        aria-hidden
        className="grid w-5 shrink-0 place-items-center text-foreground/60"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
  if (!explained) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-64 text-pretty">
        {reason}
      </TooltipContent>
    </Tooltip>
  )
}
