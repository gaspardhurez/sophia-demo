import { Check } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'

import { type Domain, domainColorValues } from '@/entities/domain'
import type { LearningOverview, OverviewItem } from '@/entities/learning'
import type { Skill } from '@/entities/skill'
import { cn } from '@/shared/lib/utils'

import {
  type ChipSkill,
  EMPTY_HEAD,
  type PieceOpen,
  GROUPS,
  groupBySkill,
  rowText,
} from '../model/rows'
import { useActivityHost } from './activity-host'
import { LaunchTestHost } from './launch-test-host'
import { OverviewRow, SkillHead } from './overview-row'
import { UpcomingDays } from './upcoming-days'

/**
 * Le hub (#155, #165, `prod/Apprentissage`) : « Aujourd'hui » à gauche et
 * « 7 prochains jours » à droite (l'un sous l'autre sous 1024 px), puis
 * « Actions rapides » —
 * quatre cartes sur deux colonnes (une seule si c'est étroit) : rattraper,
 * avancer, planifier, commencer. Dans une carte, les lignes se groupent par
 * savoir ; une carte vide se réduit à son en-tête gris, 0 et une coche.
 * « Lancer l'interro » (Avancer) s'ouvre ici, pas dans sa ligne
 * (`LaunchTestHost`).
 */
export function Overview({
  overview,
  skills,
  domains,
  onSkill,
  onPiece,
}: {
  overview: LearningOverview
  skills: Map<string, Skill>
  domains: Domain[]
  onSkill: (skillId: string) => void
  /** Une étiquette de pièce : la page ouvre sa fiche. */
  onPiece?: (piece: PieceOpen) => void
}) {
  const domainOf = (skillId: string) =>
    domains.find((d) => d.id === skills.get(skillId)?.domain_id)
  // Une étiquette de pièce (#165) : le nom de son savoir, la teinte de son
  // domaine.
  const skillOf = (skillId: string): ChipSkill => {
    const d = domainOf(skillId)
    const v = domainColorValues(d?.color)
    return {
      name: skills.get(skillId)?.name ?? '',
      emoji: d?.emoji ?? '',
      colors: { base: v.base, ink: v.ink },
    }
  }
  const whole = (item: LearningOverview['today'][number]) =>
    !!rowText(item, '').whole
  const [launching, setLaunching] = useState<{
    item: OverviewItem
    anchor: DOMRect
  } | null>(null)
  const onLaunch = useCallback(
    (item: OverviewItem, anchor: DOMRect) => setLaunching({ item, anchor }),
    [],
  )
  const doneLaunching = useCallback(() => setLaunching(null), [])
  // Le panneau d'une séance : relue dans la dernière vue d'ensemble.
  const host = useActivityHost({
    domains,
    fresh: (id) =>
      [
        ...overview.today,
        ...overview.upcoming,
        ...overview.groups.flatMap((g) => g.items),
      ].find((i) => i.activity?.id === id)?.activity ?? undefined,
  })

  return (
    <>
      {/* #165 : Aujourd'hui à gauche, 7 prochains jours à droite, une
          colonne chacun ; l'un sous l'autre sous 1024 px. */}
      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <Part title="Aujourd'hui" count={overview.today.length}>
          <div className="border-t pt-1.5">
            {overview.today.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Aucune séance
              </p>
            ) : (
              overview.today.map((item) => (
                <OverviewRow
                  key={item.activity!.id}
                  item={item}
                  domain={domainOf(item.skill_id)}
                  onSkill={onSkill}
                  onActivity={host.open}
                  onPiece={onPiece}
                  skillOf={skillOf}
                  variant="top"
                />
              ))
            )}
          </div>
        </Part>

        <Part title="7 prochains jours" count={overview.upcoming.length}>
          <UpcomingDays
            items={overview.upcoming}
            domainOf={domainOf}
            onSkill={onSkill}
            onActivity={host.open}
            onPiece={onPiece}
            skillOf={skillOf}
          />
        </Part>
      </div>

      <h2 className="-mb-3 text-base font-semibold">Actions rapides</h2>
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        {overview.groups.map((g) => {
          const empty = g.items.length === 0
          return (
            <section
              key={g.group}
              className="overflow-hidden rounded-xl border"
            >
              <header
                className={cn(
                  'flex items-end gap-2.5 px-4 py-3',
                  empty ? EMPTY_HEAD : GROUPS[g.group].head,
                )}
              >
                <span className="font-heading text-[30px] leading-none font-bold tabular-nums">
                  {g.items.length}
                </span>
                <span className="pb-0.5 text-sm font-semibold">
                  {GROUPS[g.group].title}
                </span>
                {empty && (
                  <Check
                    className="ml-auto mb-[3px] size-4"
                    strokeWidth={2.2}
                  />
                )}
              </header>
              {!empty && (
                <div className="flex flex-col px-4 pt-1 pb-2.5">
                  {groupBySkill(g.items, whole).map((entry, i) =>
                    entry.type === 'head' ? (
                      <SkillHead
                        key={`head:${entry.skillId}:${i}`}
                        name={entry.skillName}
                        domain={domainOf(entry.skillId)}
                        onOpen={() => onSkill(entry.skillId)}
                      />
                    ) : (
                      <OverviewRow
                        key={`${entry.item.kind}:${entry.item.activity?.id ?? entry.item.plan_id ?? entry.item.skill_id}:${i}`}
                        item={entry.item}
                        domain={domainOf(entry.item.skill_id)}
                        onSkill={onSkill}
                        onLaunch={onLaunch}
                        onActivity={host.open}
                        variant={entry.grouped ? 'grouped' : 'whole'}
                      />
                    ),
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
      {host.node}
      {launching && (
        <LaunchTestHost
          key={launching.item.plan_id}
          item={launching.item}
          domain={domainOf(launching.item.skill_id)}
          anchor={launching.anchor}
          onDone={doneLaunching}
        />
      )}
    </>
  )
}

/** Une partie pleine largeur : son titre, son compte, son contenu. */
function Part({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      {children}
    </section>
  )
}
