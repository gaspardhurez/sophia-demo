import { ArrowUpRight } from 'lucide-react'
import { type CSSProperties, useEffect, useRef } from 'react'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import type { Project } from '@/entities/project'
import { projectEmoji } from '@/entities/project'
import {
  usePoseWeekPreparationProject,
  usePreparationProject,
  useSetProjectReviewed,
  useWeekPreparation,
} from '@/entities/preparation'
import { ApiError } from '@/shared/api'
import { addDays, toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { Button, DoneMark, Skeleton, toast } from '@/shared/ui'

import type { PreparationCard } from '../model/cards'
import { usePreparation } from '../model/context'
import { dayLabel, toneVars } from '../model/format'
import type { PreparationWeek } from '../model/weeks'
import { NextWeek } from './next-week'
import { PastWeek } from './past-week'

/**
 * Le panneau consacré à un projet (#92, point 3) : « ‹ Projets » et sa
 * place dans la liste en tête, son nom, puis ce que la semaine affichée en dit
 * — le contenu **suit la semaine affichée** au calendrier.
 *
 * On prépare **projet par projet** : sa semaine passée, puis sa semaine
 * prochaine, puis le projet suivant. En pied, sur la semaine passée,
 * « Semaine prochaine → » ; sur la semaine prochaine, « ← Semaine passée » et
 * « Projet préparé », qui le coche et ramène à la liste.
 *
 * Les objectifs sont ceux de l'étape en cours, sinon ceux du projet (#91) :
 * le serveur les lit (`usePreparationProject`).
 */
export function ProjectFocus({
  card,
  domain,
  projects,
  position,
  count,
  shown,
  onBack,
  onShowWeek,
  onPrepared,
}: {
  card: PreparationCard
  domain: Domain | undefined
  projects: Project[]
  /** Sa place dans la liste, à partir de 1. */
  position: number
  count: number
  shown: PreparationWeek
  onBack: () => void
  onShowWeek: (week: PreparationWeek) => void
  /** Après « Projet préparé » : retour à la liste. */
  onPrepared: () => void
}) {
  const { weekKey } = usePreparation()
  const { data: preparation } = useWeekPreparation(weekKey)
  const setReviewed = useSetProjectReviewed()
  // Le calendrier se construit au fil de la préparation : ouvrir la semaine
  // prochaine d'un projet pose ses séances (une fois par projet ici ; le
  // serveur est idempotent).
  const pose = usePoseWeekPreparationProject()
  const posed = useRef(new Set<string>())
  useEffect(() => {
    if (shown !== 'next' || posed.current.has(card.project.id)) return
    posed.current.add(card.project.id)
    pose.mutate(
      { weekStart: weekKey, projectId: card.project.id },
      {
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'La pose a échoué',
          ),
      },
    )
  }, [shown, card.project.id, weekKey, pose])
  const { project: o } = card
  const { steps, chooseStep } = usePreparation()
  const { data: prep } = usePreparationProject(weekKey, o.id, steps[o.id])
  // L'étape de la semaine montrée, telle que le serveur l'a lue pour le
  // périmètre (#91) ; plusieurs croisent la semaine : on choisit (#183).
  const week = prep?.[shown]
  const step = o.steps.find((s) => s.id === week?.step_id)?.title
  const tabs = week && week.steps.length > 1 ? week.steps : null
  const reviewed =
    preparation?.reviewed.some((r) => r.project_id === card.project.id) ?? false
  const prepared = () =>
    setReviewed.mutate(
      { weekStart: weekKey, projectId: card.project.id, reviewed: true },
      {
        onSuccess: onPrepared,
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Échec'),
      },
    )
  const colors = domainColorValues(domain?.color)
  const classes = domainColor(domain?.color)
  const domainEmoji = domain?.emoji ?? ''
  return (
    <>
      <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="h-7 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ‹ Projets
        </button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {position} / {count}
        </span>
      </div>
      {/* `key` : changer de projet ou de semaine repart du haut. */}
      <div
        key={`${o.id}-${shown}`}
        className="scrollbar-quiet flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4"
        style={toneVars(colors.fonce) as CSSProperties}
      >
        {/* Le titre, puis l'étape en cours en dessous, en petit gris
            (prod/Preparation de la semaine). */}
        <div className="group/title relative flex flex-col gap-1.5 pr-7">
          <h2 className="font-heading text-lg leading-tight font-semibold">
            {projectEmoji(o, domainEmoji) && `${projectEmoji(o, domainEmoji)} `}
            {o.title}
          </h2>
          {tabs ? (
            <div className="mt-0.5 flex gap-0.5 overflow-x-auto border-b border-border">
              {tabs.map((t) => {
                const active = t.step_id === week?.step_id
                return (
                  <button
                    key={t.step_id}
                    type="button"
                    onClick={() => chooseStep(o.id, shown, t.step_id)}
                    className={cn(
                      '-mb-px inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap hover:text-foreground',
                      active
                        ? 'text-foreground shadow-[inset_0_-2px_0_var(--color-foreground)]'
                        : 'text-muted-foreground',
                    )}
                  >
                    {t.title}
                    <span className="text-xs font-normal text-muted-foreground">
                      {spanLabel(t, week!.week_start)}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            step && (
              <span className="text-xs text-muted-foreground">{step}</span>
            )
          )}
          {/* La page du projet dans un nouvel onglet (la préparation reste
              ouverte) : en haut à droite du bloc, au survol seulement — jamais
              renvoyée à la ligne avec le titre. */}
          <a
            href={`/projects/${o.id}`}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir le projet dans un nouvel onglet"
            aria-label="Ouvrir le projet dans un nouvel onglet"
            className="absolute top-0 right-0 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            <ArrowUpRight className="size-4" />
          </a>
        </div>
        {!prep ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
          </div>
        ) : shown === 'past' ? (
          <PastWeek
            prep={prep}
            project={o}
            colors={colors}
            inkClass={classes.ink}
            domainEmoji={domainEmoji}
          />
        ) : (
          <NextWeek
            prep={prep}
            card={card}
            projects={projects}
            domain={domain}
            colors={colors}
            barClass={classes.dot}
            domainEmoji={domainEmoji}
          />
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {shown === 'past' ? (
          <Button
            size="sm"
            className="ml-auto text-[13px] font-semibold"
            onClick={() => onShowWeek('next')}
          >
            Semaine prochaine →
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-[13px]"
              onClick={() => onShowWeek('past')}
            >
              ← Semaine passée
            </Button>
            <Button
              size="sm"
              className="ml-auto text-[13px] font-semibold"
              isPending={setReviewed.isPending}
              onClick={prepared}
            >
              {reviewed && <DoneMark size="row" className={classes.ink} />}
              Projet préparé
            </Button>
          </>
        )}
      </div>
    </>
  )
}

/** Les jours d'une étape dans la semaine : « jusqu'au mer. 7 » si elle la
 *  commence, « dès le jeu. 8 » si elle la finit, sinon les deux bornes. */
function spanLabel(
  span: { first_day: string; last_day: string },
  weekStart: string,
): string {
  const day = (iso: string) => dayLabel(new Date(`${iso}T00:00:00`))
  const sunday = toDateISO(addDays(new Date(`${weekStart}T00:00:00`), 6))
  const opens = span.first_day === weekStart
  const closes = span.last_day === sunday
  if (opens && !closes) return `jusqu'au ${day(span.last_day)}`
  if (closes && !opens) return `dès le ${day(span.first_day)}`
  return `${day(span.first_day)} → ${day(span.last_day)}`
}
