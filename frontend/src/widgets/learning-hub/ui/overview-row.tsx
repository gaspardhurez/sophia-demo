import { Check, Play, Redo2, Trash2 } from 'lucide-react'
import { type CSSProperties, type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  type Activity,
  usePostponeActivity,
  useUpdateActivity,
} from '@/entities/activity'
import type { Domain } from '@/entities/domain'
import { domainColor, domainColorValues } from '@/entities/domain'
import type { OverviewItem } from '@/entities/learning'
import { usePlans, useStartSkill } from '@/entities/plan'
import {
  DeleteActivityDialog,
  useActivityDeletion,
} from '@/features/activity/delete'
import { useSessionCheck } from '@/features/activity/edit'
import { PlanActivityDialog } from '@/features/activity/plan'
import { CloseCycleDialog } from '@/features/plan/close-cycle'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { Button, Chip, toast } from '@/shared/ui'

import {
  type ChipSkill,
  type PieceOpen,
  pieceOpenOf,
  rowText,
  sessionChips,
  type SessionChip,
} from '../model/rows'
import { PieceChips } from './piece-chips'

const fail = (err: unknown, fallback = 'Échec') =>
  toast.error(err instanceof ApiError ? err.message : fallback)

/**
 * Une chose à faire (`prod/Apprentissage`, #155), en trois formats :
 * - `top` (Aujourd'hui, 7 prochains jours) : l'emoji en 32 px, le titre
 *   (« activité · heure ») et sa chip, puis les pièces de la séance en
 *   étiquettes, tous ses savoirs à la suite (#165, `PieceChips`) ; une ligne
 *   sans séance garde « savoir · raison » ;
 * - `grouped` (une carte, sous l'en-tête de son savoir) : en retrait, l'emoji
 *   en 22 px, sans le nom du savoir ;
 * - `whole` (la ligne est le savoir) : son nom en titre — il ouvre le savoir
 *   à droite —, la raison dessous ; « Commencer » tient sur une ligne, son
 *   projet en secondaire après le nom.
 * Le geste au bout, selon ce qu'elle est. Une ligne qui est une séance
 * (aujourd'hui, 7 prochains jours, à rattraper) : son titre ouvre son panneau.
 */
export function OverviewRow({
  item,
  domain,
  onSkill,
  onLaunch,
  onActivity,
  onPiece,
  skillOf,
  gesture = true,
  variant,
}: {
  item: OverviewItem
  domain: Domain | undefined
  /** Le nom du savoir : il s'ouvre à droite. */
  onSkill: (skillId: string) => void
  /** « Lancer l'interro » : la vue d'ensemble ouvre la modale, à côté du
   *  bouton. */
  onLaunch?: (item: OverviewItem, anchor: DOMRect) => void
  /** Une étiquette de pièce : sa fiche (27/10) ; l'étude ouvre les notes,
   *  une pièce sans fiche n'ouvre rien. */
  onPiece?: (piece: PieceOpen) => void
  /** Le titre d'une séance : son panneau s'ouvre à côté. */
  onActivity?: (activity: Activity, anchor: DOMRect) => void
  /** Le nom, l'emoji et la teinte d'un savoir : les étiquettes d'une séance
   *  (#165) peuvent venir de plusieurs savoirs. */
  skillOf?: (skillId: string) => ChipSkill
  /** Sans geste au bout (les séances à venir). */
  gesture?: boolean
  variant: 'top' | 'grouped' | 'whole'
}) {
  const navigate = useNavigate()
  const activity = item.activity
  const text = rowText(item, domain?.emoji ?? '')
  const grouped = variant === 'grouped'
  const chips: SessionChip[] =
    variant === 'top' && text.chips && activity && skillOf
      ? sessionChips(activity, skillOf)
      : []

  return (
    <div
      data-session-row
      className={cn(
        'flex items-center gap-3 py-1',
        grouped ? 'min-h-10 pl-[30px]' : text.reason ? 'min-h-12' : 'min-h-10',
      )}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center',
          grouped
            ? 'size-[22px] rounded-md text-xs'
            : 'size-8 rounded-lg text-[15px]',
          domainColor(domain?.color).soft,
        )}
      >
        {text.emoji}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          {text.whole ? (
            <button
              type="button"
              onClick={() => onSkill(item.skill_id)}
              className="min-w-0 truncate text-left text-sm font-semibold hover:underline"
            >
              {text.title}
            </button>
          ) : activity && onActivity ? (
            <button
              type="button"
              data-session-open
              onClick={(e) =>
                onActivity(activity, e.currentTarget.getBoundingClientRect())
              }
              className="min-w-0 truncate text-left text-sm font-semibold hover:underline"
            >
              {text.title}
            </button>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold">
              {text.title}
            </span>
          )}
          {text.aside && (
            <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
              {text.aside}
            </span>
          )}
          {text.chip && (
            <Chip tone={text.chip.tone} className="shrink-0">
              {text.chip.label}
            </Chip>
          )}
        </span>
        {chips.length > 0 && activity ? (
          <PieceChips
            chips={chips}
            onOpen={(chip) => {
              if (chip.act.kind === 'study') {
                navigate(`/skills/${chip.act.skill_id}/notes`)
                return
              }
              const piece = pieceOpenOf(chip)
              if (piece) onPiece?.(piece)
            }}
          />
        ) : (
          (variant === 'top' || text.reason) && (
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
              {variant === 'top' && (
                <>
                  <button
                    type="button"
                    onClick={() => onSkill(item.skill_id)}
                    className="whitespace-nowrap text-foreground/80 hover:underline"
                  >
                    {item.skill_name}
                  </button>
                  {text.reason && <span>·</span>}
                </>
              )}
              <span className="truncate">{text.reason}</span>
            </span>
          )
        )}
      </div>
      {gesture && (
        <RowGesture item={item} domain={domain} onLaunch={onLaunch} />
      )}
    </div>
  )
}

/** L'en-tête d'un savoir dans une carte : emoji, nom — il s'ouvre à droite. */
export function SkillHead({
  name,
  domain,
  onOpen,
}: {
  name: string
  domain: Domain | undefined
  onOpen: () => void
}) {
  return (
    <div className="flex items-center gap-2 pt-2.5 pb-0.5">
      <span
        className={cn(
          'grid size-[22px] place-items-center rounded-md text-xs',
          domainColor(domain?.color).soft,
        )}
      >
        {domain?.emoji}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="text-[13.5px] font-semibold hover:underline"
      >
        {name}
      </button>
    </div>
  )
}

/** Le geste d'une ligne : ce que son genre appelle. */
function RowGesture({
  item,
  domain,
  onLaunch,
}: {
  item: OverviewItem
  domain: Domain | undefined
  onLaunch?: (item: OverviewItem, anchor: DOMRect) => void
}) {
  const navigate = useNavigate()
  switch (item.kind) {
    case 'recall':
      return (
        <Button
          size="sm"
          className="bg-(--ink) text-white hover:bg-(--ink)/90"
          style={
            { '--ink': domainColorValues(domain?.color).ink } as CSSProperties
          }
          onClick={() => navigate(`/plans/${item.plan_id}/interro`)}
        >
          Passer l'interro
        </Button>
      )
    case 'missed':
      return <MissedGestures item={item} />
    case 'session':
      return <SessionCheck item={item} domain={domain} />
    case 'next_phase':
    case 'unplanned':
      return <Plan item={item} domain={domain} />
    case 'start_recall':
      return onLaunch ? (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) =>
            onLaunch(item, e.currentTarget.getBoundingClientRect())
          }
        >
          Lancer l'interro
        </Button>
      ) : null
    case 'close':
      return <Close item={item} domain={domain} />
    case 'start':
      return <Start item={item} domain={domain} />
  }
}

/** Un geste en icône bordée. */
function IconGesture({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * Une séance passée non cochée : Faite, Reporter, Supprimer — les gestes des
 * non faites de la préparation (#94), directs et définitifs ici (on défait au
 * calendrier).
 */
function MissedGestures({ item }: { item: OverviewItem }) {
  const activity = item.activity!
  const update = useUpdateActivity()
  const postpone = usePostponeActivity()
  const sessionCheck = useSessionCheck()
  const deletion = useActivityDeletion({ onError: (err) => fail(err) })

  return (
    <span className="flex shrink-0 gap-1">
      {sessionCheck.dialog}
      <IconGesture
        label="Faite"
        onClick={() =>
          sessionCheck.request(activity, () =>
            update
              .mutateAsync({ id: activity.id, body: { done: true } })
              .catch((err) => fail(err)),
          )
        }
      >
        <Check />
      </IconGesture>
      <IconGesture
        label="Reporter à la semaine prochaine"
        onClick={() =>
          postpone
            .mutateAsync({ id: activity.id })
            .catch((err) => fail(err, 'Le report a échoué'))
        }
      >
        <Redo2 />
      </IconGesture>
      <IconGesture
        label="Supprimer"
        onClick={() => void deletion.request(activity)}
      >
        <Trash2 />
      </IconGesture>
      <DeleteActivityDialog
        pending={deletion.pending}
        isPending={deletion.isPending}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </span>
  )
}

/** Une séance du jour (l'interro du jour comprise) : la coche, par sa
 *  modale (#140). */
function SessionCheck({
  item,
  domain,
}: {
  item: OverviewItem
  domain: Domain | undefined
}) {
  const activity = item.activity!
  const update = useUpdateActivity()
  const sessionCheck = useSessionCheck()
  return (
    <>
      {sessionCheck.dialog}
      <button
        type="button"
        role="checkbox"
        aria-checked={activity.done}
        aria-label={activity.done ? 'Décocher' : 'Cocher'}
        onClick={() =>
          sessionCheck.request(activity, () =>
            update
              .mutateAsync({
                id: activity.id,
                body: { done: !activity.done },
              })
              .catch((err) => fail(err)),
          )
        }
        className="grid size-[30px] shrink-0 place-items-center rounded-md hover:bg-muted"
      >
        <span
          className={cn(
            'grid size-[18px] place-items-center rounded-full',
            !activity.done &&
              'border-[1.5px] border-dashed border-muted-foreground',
          )}
          style={
            activity.done
              ? { background: domainColorValues(domain?.color).ink }
              : undefined
          }
        >
          {activity.done && (
            <Check className="size-[11px] text-white" strokeWidth={3} />
          )}
        </span>
      </button>
    </>
  )
}

/** Planifier une séance du savoir, sur son cycle. */
function Plan({
  item,
  domain,
}: {
  item: OverviewItem
  domain: Domain | undefined
}) {
  const [open, setOpen] = useState(false)
  if (!domain) return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Planifier
      </Button>
      {open && (
        <PlanActivityDialog
          skillId={item.skill_id}
          skillName={item.skill_name}
          domainId={domain.id}
          accent={domainColor(domain.color)}
          domainEmoji={domain.emoji ?? ''}
          planId={item.plan_id ?? undefined}
          onOpenChange={setOpen}
        />
      )}
    </>
  )
}

/** Tout est validé : terminer le cycle, par sa modale (acquis, rétention). */
function Close({
  item,
  domain,
}: {
  item: OverviewItem
  domain: Domain | undefined
}) {
  const [open, setOpen] = useState(false)
  const { data: plans } = usePlans(open ? item.skill_id : undefined)
  const plan = plans?.find((p) => p.id === item.plan_id)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Terminer
      </Button>
      {plan && (
        <CloseCycleDialog
          plan={plan}
          open={open}
          onOpenChange={setOpen}
          domainEmoji={domain?.emoji ?? ''}
        />
      )}
    </>
  )
}

/** Démarrer : le cycle prévu s'ouvre (celui du projet), sinon un neuf.
 *  Le bouton de la page savoir (▶, l'encre foncée du domaine). */
function Start({
  item,
  domain,
}: {
  item: OverviewItem
  domain: Domain | undefined
}) {
  const start = useStartSkill()
  return (
    <Button
      size="sm"
      className="h-[30px] gap-1.5 text-white hover:opacity-90"
      style={{ background: domainColorValues(domain?.color).fonce }}
      isPending={start.isPending}
      onClick={() =>
        start
          .mutateAsync({
            skillId: item.skill_id,
            projectId: item.project_id ?? undefined,
          })
          .then(() => toast.success(`${item.skill_name} — cycle ouvert`))
          .catch((err) => fail(err, 'Échec du démarrage'))
      }
    >
      <Play className="size-[11px] fill-current" /> Démarrer
    </Button>
  )
}
