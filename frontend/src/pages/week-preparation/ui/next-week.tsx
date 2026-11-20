import { Check, X } from 'lucide-react'
import { useState } from 'react'

import {
  type Activity,
  useUnlinkActivityAchievement,
} from '@/entities/activity'
import type { Domain, DomainColorValues } from '@/entities/domain'
import { useDeleteMetricValue } from '@/entities/metric'
import type { Project } from '@/entities/project'
import {
  type PreparationProject,
  type PrepResultNext,
  useInvalidatePreparations,
} from '@/entities/preparation'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

import type { PreparationCard } from '../model/cards'
import { usePreparation } from '../model/context'
import {
  hoursLabel,
  metricValue,
  parseMetricValue,
  sessionLabel,
  tint,
  TONE_TEXT,
} from '../model/format'
import { linkedOf } from '../model/linked'
import { DashedButton, DayList, FocusSection, SubTitle } from './bits'
import { NextLearning } from './next-learning'
import { TotalRow } from './next-total'

const fail = (err: unknown) =>
  toast.error(err instanceof ApiError ? err.message : 'Échec')

/**
 * La **semaine prochaine** d'un projet (#92, point 5) : ses Cibles (les
 * Totaux, réalisé et prévu ; les Résultats ; les réalisations), son
 * Apprentissage, ses Activités. Tout ce qui se prévoit se lie à au moins une
 * séance, par le mode liaison. « Projet préparé » est dans le pied du
 * panneau (`ProjectFocus`).
 */
export function NextWeek({
  prep,
  card,
  projects,
  domain,
  colors,
  barClass,
  domainEmoji,
}: {
  prep: PreparationProject
  card: PreparationCard
  projects: Project[]
  domain: Domain | undefined
  colors: DomainColorValues
  /** La classe de remplissage des barres (`domainColor(...).dot`). */
  barClass: string
  domainEmoji: string
}) {
  const { project, scope, ahead } = card
  const step = prep.next.step_id
  const achievements = project.achievements.filter(
    (a) => !a.done && (step === null || a.step_id === step),
  )
  return (
    <div className="flex flex-col gap-6">
      <NextActivities prep={prep} domainEmoji={domainEmoji} />
      <NextLearning
        prep={prep}
        project={project}
        projects={projects}
        domain={domain}
        colors={colors}
        domainEmoji={domainEmoji}
      />

      <FocusSection title="Cibles">
        {scope && scope.lines.length > 0 && (
          <div className="flex flex-col gap-2">
            {scope.lines.map((line) => (
              <TotalRow
                key={line.key}
                line={line}
                ahead={ahead.get(line.key)}
                project={project}
                scope={scope}
                activities={prep.next.activities}
                colors={colors}
                barClass={barClass}
                domainEmoji={domainEmoji}
              />
            ))}
          </div>
        )}
        {prep.next.results.length > 0 && (
          <div className="flex flex-col gap-2">
            <SubTitle>Résultats</SubTitle>
            {prep.next.results.map((r) => (
              <ResultRow
                key={r.metric_id}
                result={r}
                projectId={project.id}
                activities={prep.next.activities}
                colors={colors}
                domainEmoji={domainEmoji}
              />
            ))}
          </div>
        )}
        {achievements.length > 0 && (
          <div className="flex flex-col gap-2">
            <SubTitle>Réalisations</SubTitle>
            {achievements.map((a) => (
              <AchievementRow
                key={a.id}
                achievement={a}
                projectId={project.id}
                colors={colors}
                domainEmoji={domainEmoji}
              />
            ))}
          </div>
        )}
        {!scope &&
          prep.next.results.length === 0 &&
          achievements.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune cible sur ce périmètre.
            </p>
          )}
      </FocusSection>
    </div>
  )
}

/**
 * Un Résultat pour la semaine : sa valeur, puis « + Cible » (pointillé gris)
 * qui ouvre un champ en place, prérempli de la suggestion. Entrée valide et
 * ouvre la liaison : la cible se pose sur la séance choisie. Liée, elle se lit
 * « 1 480 → 1 500 » en texte coloré, sa séance sous le nom ; × au survol la
 * délie et la retire.
 */
function ResultRow({
  result: r,
  projectId,
  activities,
  colors,
  domainEmoji,
}: {
  result: PrepResultNext
  projectId: string
  activities: Activity[]
  colors: DomainColorValues
  domainEmoji: string
}) {
  const { arm } = usePreparation()
  const invalidate = useInvalidatePreparations()
  const remove = useDeleteMetricValue()
  const [text, setText] = useState<string | null>(null)
  const key = `target:${r.metric_id}`
  const armed = arm.arm?.key === key
  const target = r.targets[0]
  const session = target
    ? activities.find((a) => a.id === target.activity_id)
    : undefined
  const current = r.current ? metricValue(r.current.value, r.unit) : '—'
  const value =
    armed && arm.arm?.subject.kind === 'target'
      ? arm.arm.subject.value
      : target?.value

  function commit() {
    const v = parseMetricValue(text ?? '', r.unit)
    if (v === null) {
      toast.error('Valeur illisible')
      return
    }
    setText(null)
    arm.toggle({
      key,
      projectId,
      emoji: r.emoji || '🎯',
      text: r.name,
      subject: { kind: 'target', metricId: r.metric_id, value: v },
    })
  }

  async function unlink() {
    try {
      for (const t of r.targets) await remove.mutateAsync({ id: t.id })
      invalidate()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div
      className="group/row -mx-1.5 flex min-h-7 items-center gap-2 rounded-md px-1.5 text-[13px]"
      style={
        armed
          ? {
              background: tint(colors.base, 10),
              boxShadow: `0 0 0 1px ${colors.base}`,
            }
          : undefined
      }
    >
      <span className="w-5 shrink-0 text-center">{r.emoji || '🎯'}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{r.name}</span>
        {session && (
          <span className="truncate text-[11px] text-muted-foreground">
            {sessionLabel(session, domainEmoji)}
            {r.targets.length > 1 && ` +${r.targets.length - 1}`}
          </span>
        )}
      </span>
      {text !== null ? (
        <span data-arm-source className="flex items-center gap-1.5">
          <span className="text-muted-foreground tabular-nums">
            {current} →
          </span>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setText(null)
              }
            }}
            onBlur={(e) => {
              if (!e.relatedTarget?.closest('[data-commit]')) setText(null)
            }}
            className="h-7 w-20 rounded-md border border-input bg-background px-2 text-[13px] tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="button"
            data-commit
            aria-label="Valider la cible"
            onClick={commit}
            className="grid size-7 place-items-center rounded-md bg-foreground text-background"
          >
            <Check className="size-3.5" />
          </button>
        </span>
      ) : value !== undefined ? (
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="text-muted-foreground">{current}</span>
          <span className="font-semibold" style={{ color: colors.ink }}>
            → {metricValue(value, r.unit)}
          </span>
          <button
            type="button"
            data-arm-source
            aria-label={armed ? 'Annuler' : 'Délier et retirer la cible'}
            onClick={armed ? arm.cancel : unlink}
            className={cn(
              'size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
              // Au repos, elle ne prend pas de place : la cible reste au
              // bord droit, comme les lignes au-dessus.
              armed ? 'grid' : 'hidden group-hover/row:grid',
            )}
          >
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground tabular-nums">{current}</span>
          <DashedButton
            data-arm-source
            onClick={() =>
              setText(
                r.suggestion != null
                  ? metricValue(r.suggestion, r.unit)
                  : r.current
                    ? metricValue(r.current.value, r.unit)
                    : '',
              )
            }
          >
            + Cible
          </DashedButton>
        </span>
      )}
    </div>
  )
}

/**
 * Une réalisation : « + Cette semaine » (pointillé gris) ouvre la liaison —
 * la séance choisie la prépare. Liée, sa séance s'écrit sous son nom ; × au
 * survol la délie.
 */
function AchievementRow({
  achievement: a,
  projectId,
  colors,
  domainEmoji,
}: {
  achievement: Project['achievements'][number]
  projectId: string
  colors: DomainColorValues
  domainEmoji: string
}) {
  const { arm, weeks } = usePreparation()
  const invalidate = useInvalidatePreparations()
  const unlinkMutation = useUnlinkActivityAchievement()
  const key = `achievement:${a.id}`
  const armed = arm.arm?.key === key
  const linked = a.activities
    .filter(
      (x) =>
        x.start_at &&
        new Date(x.start_at) >= weeks.next.start &&
        new Date(x.start_at) < weeks.next.end,
    )
    .sort((x, y) => (x.start_at ?? '').localeCompare(y.start_at ?? ''))

  async function unlink() {
    try {
      for (const x of linked)
        await unlinkMutation.mutateAsync({ id: x.id, achievementId: a.id })
      invalidate()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="group/row flex min-h-7 items-center gap-2 text-[13px]">
      <span className="w-5 shrink-0 text-center">{a.emoji || '🏆'}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{a.title}</span>
        {linked[0] && (
          <span className="truncate text-[11px] text-muted-foreground">
            {sessionLabel(linked[0], domainEmoji)}
            {linked.length > 1 && ` +${linked.length - 1}`}
          </span>
        )}
      </span>
      {linked.length > 0 ? (
        <button
          type="button"
          aria-label="Délier de la séance"
          onClick={unlink}
          className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-muted hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : (
        <DashedButton
          data-arm-source
          className={cn(armed && ['border-solid', TONE_TEXT])}
          style={
            armed
              ? {
                  borderColor: colors.base,
                  background: tint(colors.base, 10),
                  boxShadow: `0 0 0 3px ${tint(colors.base, 20)}`,
                }
              : undefined
          }
          onClick={() =>
            arm.toggle({
              key,
              projectId,
              emoji: a.emoji || '🏆',
              text: a.title,
              subject: { kind: 'achievement', achievementId: a.id },
            })
          }
        >
          {armed ? 'Cette semaine' : '+ Cette semaine'}
        </DashedButton>
      )}
    </div>
  )
}

/**
 * Les séances de la semaine prochaine, groupées par jour (#145) — les sans
 * heure d'abord dans un jour, l'horaire à droite (comme les faites de la
 * semaine écoulée). Pas de geste ici : on déplace ou
 * supprime une séance au calendrier, où le focus propose aussi les activités
 * types du projet.
 */
function NextActivities({
  prep,
  domainEmoji,
}: {
  prep: PreparationProject
  domainEmoji: string
}) {
  const kept = prep.next.activities
  const sansHeure = kept.filter((a) => a.all_day).length
  // Planifié : les séances de la semaine, dans l'ordre du calendrier.
  const sessions = [...kept].sort(
    (x, y) =>
      (x.start_at ?? '')
        .slice(0, 10)
        .localeCompare((y.start_at ?? '').slice(0, 10)) ||
      Number(!x.all_day) - Number(!y.all_day) ||
      (x.start_at ?? '').localeCompare(y.start_at ?? ''),
  )

  return (
    <FocusSection
      title="Activités"
      aside={`${kept.length} séance${kept.length > 1 ? 's' : ''}${
        sansHeure ? ` · ${sansHeure} sans heure` : ''
      }`}
    >
      <div className="flex flex-col gap-1.5">
        {sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">Rien de planifié</p>
        )}
        <DayList
          items={sessions
            .filter((a) => a.start_at)
            .map((a) => {
              // Les actes d'apprentissage se lisent dans la section
              // Apprentissage (#108) : ici, ni leurs lignes ni leurs marques.
              const linked = linkedOf(
                { ...a, acts: [] },
                new Map(),
                domainEmoji,
              )
              return {
                key: a.id,
                day: new Date(a.start_at as string),
                emoji: a.emoji || domainEmoji,
                title: a.title,
                hour: a.all_day ? '' : hoursLabel(a),
                details: (linked.length > 0 || a.notes) && (
                  <div className="flex flex-col gap-0.5">
                    {linked.map((l) => (
                      <span key={l.key} className="flex min-w-0 gap-1">
                        <span>{l.emoji}</span>
                        <span className="truncate">{l.label}</span>
                      </span>
                    ))}
                    {a.notes && (
                      <p className="whitespace-pre-line">{a.notes}</p>
                    )}
                  </div>
                ),
              }
            })}
        />
      </div>
    </FocusSection>
  )
}
