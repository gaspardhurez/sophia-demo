import { CalendarDays, CircleAlert } from 'lucide-react'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import {
  WeekProjectCard,
  weekStep,
  principalDomainId,
  projectEmoji,
} from '@/entities/project'
import { toDateISO } from '@/shared/lib/date'
import { Button, DoneMark } from '@/shared/ui'

import type { PreparationCard } from '../model/cards'
import { usePreparation } from '../model/context'
import type { PreparationWeek } from '../model/weeks'

/**
 * La liste de la préparation (#92, point 2) : une carte par projet en cours,
 * **identique à celle du calendrier** — projet · étape, la barre d'un Total
 * —, puis ses chips : « n non faite(s) » en rouge pour la semaine écoulée,
 * « n prévue(s) ». Une coche à la couleur du domaine dit qu'il a été préparé
 * (« Projet préparé », en bas de sa semaine prochaine).
 * Un clic ouvre le projet dans le panneau.
 *
 * La barre suit la semaine affichée : la semaine écoulée montre le réalisé,
 * la semaine prochaine y ajoute son prévu en plein pâle.
 */
export function ProjectList({
  cards,
  domains,
  shown,
  range,
  reviewed,
  onOpen,
  onValidate,
  validating = false,
  loading = false,
}: {
  cards: PreparationCard[]
  domains: Domain[]
  shown: PreparationWeek
  /** « 28 sept. → 11 oct. » : les deux semaines. */
  range: string
  /** Les projets marqués « Projet préparé » (l'entité préparation). */
  reviewed: Set<string>
  onOpen: (projectId: string) => void
  onValidate: () => void
  validating?: boolean
  /** Les projets ne sont pas encore lus : pas de « aucun projet ». */
  loading?: boolean
}) {
  const domainOf = (id: string) => domains.find((d) => d.id === id)
  const { weeks, steps } = usePreparation()
  const today = toDateISO(new Date())
  const weekStart = toDateISO(weeks[shown].start)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-base font-semibold">
          Préparation de la semaine
        </h2>
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
          {range}
        </span>
      </div>
      <div className="scrollbar-quiet -mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
        {!loading && cards.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun projet en cours sur ces deux semaines.
          </p>
        )}
        {cards.map(({ project: o, scope, ahead, missed, planned }) => {
          const domain = domainOf(principalDomainId(o))
          const colors = domainColor(domain?.color)
          return (
            <WeekProjectCard
              key={o.id}
              title={`${projectEmoji(o, domain?.emoji) ?? ''} ${o.title}`.trim()}
              // L'étape de la semaine montrée (#183 : celle qui couvre son
              // lundi, ou celle choisie), qu'elle porte ou non une part d'un
              // Total (la barre, elle, suit `scope`).
              stepTitle={
                weekStep(o, weekStart, today, steps[o.id]?.[shown] ?? null)
                  ?.title ?? null
              }
              trailing={
                reviewed.has(o.id) ? (
                  <span title="Revu">
                    <DoneMark size="block" className={colors.dot} />
                  </span>
                ) : undefined
              }
              lines={scope?.lines ?? []}
              planned={shown === 'next' ? ahead : undefined}
              showPlanned={shown === 'next'}
              barClassName={colors.dot}
              color={domainColorValues(domain?.color).base}
              onClick={() => onOpen(o.id)}
              footer={() => (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  {shown === 'past' && missed > 0 && (
                    <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-red-600">
                      <CircleAlert className="size-3" strokeWidth={2.4} />
                      {missed} {missed > 1 ? 'non faites' : 'non faite'}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-muted-foreground">
                    <CalendarDays className="size-3" strokeWidth={2.2} />
                    {planned} {planned > 1 ? 'prévues' : 'prévue'}
                  </span>
                </div>
              )}
            />
          )
        })}
      </div>
      <Button
        className="h-[34px] w-full text-[13px] font-semibold"
        isPending={validating}
        onClick={onValidate}
      >
        Valider la préparation
      </Button>
    </div>
  )
}
