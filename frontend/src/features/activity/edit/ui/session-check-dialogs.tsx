import { Button, Dialog, DialogContent, DoneMark } from '@/shared/ui'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  LearningChoiceDialog,
  learningActs,
  useRemoveActivityAct,
} from '@/entities/activity'
import { domainColor, domainColorValues, useDomains } from '@/entities/domain'
import { useMetrics } from '@/entities/metric'
import { useProjects, projectEmoji } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

import { checkGauges } from '../model/check-gauges'
import { type CheckedActivity, useCheckDraft } from '../model/use-check-draft'
import { CheckProjectBlock, CheckSection } from './check-project-block'
import { LearningSection } from './learning-section'

/** Ce que la coche tient d'une séance : son brouillon, son jour, sa durée. */
function useCheck(activity: CheckedActivity) {
  const start = activity.start_at ? new Date(activity.start_at) : new Date()
  // L'apport de la séance au compteur d'heures : sa durée, lue au calendrier.
  const hours =
    activity.all_day || !activity.start_at || !activity.end_at
      ? 0
      : (new Date(activity.end_at).getTime() - start.getTime()) / 3_600_000
  const day = toDateISO(start)
  const draft = useCheckDraft(activity, day)
  const [saving, setSaving] = useState(false)

  async function validate(onConfirmed: () => void) {
    setSaving(true)
    try {
      await draft.save()
      onConfirmed()
      return true
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
      return false
    } finally {
      setSaving(false)
    }
  }

  return { start, hours, day, draft, saving, validate }
}

/**
 * Le contenu de la coche (#140 ; #177, #182 : `kit/Coche seance`) d'une
 * séance liée à un projet : l'en-tête de la séance, puis **un bloc par projet
 * lié** (`CheckProjectBlock`) — ses savoirs, ses Totaux en jauges (l'apport
 * de la séance en clair, en direct) et ses compteurs, ses Résultats avec
 * cible et record, ses Réalisations à cocher —, puis les **notes** de la
 * séance. Un savoir posé qui n'est d'aucun projet lié va dans le premier
 * bloc. Tout reste en brouillon jusqu'à Valider (`useCheckDraft`) ; les
 * relevés s'y lisent comme réels, la séance étant faite, et une réalisation
 * se coche sur son projet.
 */
function CheckBody({
  activity,
  check,
  onNavigate,
}: {
  activity: CheckedActivity
  check: ReturnType<typeof useCheck>
  onNavigate: () => void
}) {
  const { data: domains } = useDomains()
  const { data: projects } = useProjects(activity.domain_id)
  const { data: domainMetrics } = useMetrics(activity.domain_id)
  const { start, hours, day, draft } = check

  const domain = domains?.find((d) => d.id === activity.domain_id)
  const colors = domainColorValues(domain?.color)
  // Dans l'ordre des liens de la séance.
  const linked = activity.projects.flatMap(
    (l) => projects?.find((o) => o.id === l.project_id) ?? [],
  )
  const noop = () => {}
  // Un savoir est au projet qui l'a dans sa séquence ; sinon au premier.
  const ownerOf = (skillId: string) =>
    linked.find((o) => o.learning.some((s) => s.skill_id === skillId))?.id ??
    linked[0]?.id
  // Les jauges suivent le brouillon : une valeur saisie, un acte ajouté.
  const gauges = checkGauges(linked, activity.projects, {
    activity_type_id: activity.activity_type_id ?? null,
    acts: draft.acts,
    all_day: activity.all_day,
    start_at: activity.start_at,
    end_at: activity.end_at,
    values: draft.values,
  })

  return (
    <>
      <div className="flex items-center gap-2">
        <DoneMark size="row" className={domainColor(domain?.color).ink} />
        <span className="min-w-0 truncate text-lg font-semibold">
          {activity.emoji ? `${activity.emoji} ` : ''}
          {activity.title}
        </span>
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
          {whenLabel(start, activity.all_day)}
        </span>
      </div>
      {linked.map((o) => {
        const link = activity.projects.find((l) => l.project_id === o.id)
        return (
          <CheckProjectBlock
            key={o.id}
            project={o}
            emoji={projectEmoji(o, domain?.emoji) ?? ''}
            gauges={gauges.filter((g) => g.projectId === o.id)}
            draft={draft}
            metrics={domainMetrics ?? []}
            colors={colors}
            hours={hours}
            learning={
              <LearningSection
                variant="check"
                scope={(id) => ownerOf(id) === o.id}
                adding={false}
                onDone={noop}
                domainId={activity.domain_id}
                domainLabel={{
                  emoji: domain?.emoji ?? '',
                  name: domain?.name ?? '',
                }}
                colors={colors}
                links={
                  link ? [{ project_id: o.id, step_id: link.step_id }] : []
                }
                projects={projects ?? []}
                day={day}
                acts={draft.acts}
                done
                onAdd={draft.addAct}
                onRemove={draft.removeAct}
                onFeedback={draft.rateAct}
                onNavigate={onNavigate}
                chipLabel
              />
            }
          />
        )
      })}
      <div className="h-px bg-border" />
      <CheckSection title="Notes">
        <textarea
          value={draft.notes}
          onChange={(e) => draft.setNotes(e.target.value)}
          rows={2}
          aria-label="Notes de la séance"
          placeholder="Sensations, charges, ce qui a coincé…"
          className="min-h-[44px] resize-none rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-[13px] leading-[1.45] outline-none [field-sizing:content] focus:border-solid focus:border-foreground/45"
        />
      </CheckSection>
    </>
  )
}

/**
 * La coche en **modale** (partout sauf le calendrier complet) : Annuler, la
 * séance reste à faire ; Valider, les changements partent et `onConfirmed`
 * la coche. Le focus s'ouvre sur Valider : Entrée coche tout de suite.
 */
export function CheckDialog({
  activity,
  onCancel,
  onConfirmed,
}: {
  activity: CheckedActivity
  onCancel: () => void
  onConfirmed: () => void
}) {
  const check = useCheck(activity)
  // À l'ouverture, le focus va à Valider : Entrée coche tout de suite.
  const validateRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        data-activity-ui
        showCloseButton={false}
        className="max-h-[85vh] max-w-[420px] grid-cols-[minmax(0,1fr)] sm:max-w-[420px] gap-3 overflow-y-auto p-5"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          validateRef.current?.focus()
        }}
      >
        <CheckBody activity={activity} check={check} onNavigate={onCancel} />
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            ref={validateRef}
            isPending={check.saving}
            onClick={() => void check.validate(onConfirmed)}
          >
            Valider
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * La coche **dans la colonne de gauche du calendrier** (décisions de
 * l'utilisateur, 17/11) : la séance est **déjà cochée** à l'écran (l'appelant
 * l'a montrée cochée), et cet écran, à la place de la colonne, sert à
 * compléter si on veut — sans bouton. Il se ferme dès qu'on passe à autre
 * chose : un clic ailleurs, Échap ; un clic dans ses menus ou une fenêtre
 * qu'il ouvre n'en est pas un. À la fermeture, ce qui a été saisi
 * s'enregistre, puis `onDone` coche la séance pour de bon : cochée plus tôt,
 * les compteurs relus la compteraient déjà, et son apport s'afficherait deux
 * fois. `className` : la colonne qui la porte.
 */
export function CheckColumn({
  activity,
  className,
  onDone,
}: {
  activity: CheckedActivity
  className?: string
  onDone: () => void
}) {
  const check = useCheck(activity)
  const root = useRef<HTMLElement>(null)
  const closing = useRef(false)

  function close() {
    if (closing.current) return
    closing.current = true
    // Un enregistrement refusé se dit (toast) ; la séance se coche quand même.
    void check.validate(() => {}).finally(onDone)
  }
  // Les écouteurs du document prennent la dernière version.
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (!target || root.current?.contains(target)) return
      if (
        target.closest(
          '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return
      latest.current()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      latest.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <aside
      ref={root}
      data-activity-ui
      aria-label={`Compléter « ${activity.title} »`}
      className={cn('flex flex-col gap-3', className)}
    >
      <CheckBody activity={activity} check={check} onNavigate={close} />
    </aside>
  )
}

/** La décoche : garder l'apprentissage, ou le retirer (retours compris). */
export function UncheckDialog({
  activity,
  onCancel,
  onConfirmed,
}: {
  activity: CheckedActivity
  onCancel: () => void
  onConfirmed: () => void
}) {
  const removeAct = useRemoveActivityAct()
  const [choice, setChoice] = useState(0)
  const [saving, setSaving] = useState(false)
  const acts = learningActs(activity.acts)

  async function confirm() {
    setSaving(true)
    try {
      if (choice === 1)
        for (const a of acts)
          await removeAct.mutateAsync({ id: activity.id, actId: a.id })
      onConfirmed()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    } finally {
      setSaving(false)
    }
  }

  return (
    <LearningChoiceDialog
      title={`Décocher « ${activity.title} » ?`}
      acts={acts}
      choices={[
        {
          title: "Garder l'apprentissage",
          description:
            'La séance redevient à faire avec son étude et ses exercices ; leurs retours sont gardés.',
        },
        {
          title: "Retirer l'apprentissage",
          description:
            'La séance redevient à faire, sans apprentissage ; les retours sont supprimés.',
        },
      ]}
      value={choice}
      onChange={setChoice}
      action="Décocher"
      pending={saving}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    />
  )
}

/** « lun. 20 · 19:00 », ou le jour seul pour une séance sans heure. */
function whenLabel(start: Date, allDay: boolean): string {
  const day = start.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
  })
  if (allDay) return day
  const time = start.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day} · ${time}`
}
