import { Check, Redo2, Trash2 } from 'lucide-react'

import { type Activity, LevelChip } from '@/entities/activity'
import type { DomainColorValues } from '@/entities/domain'
import {
  type Project,
  totalMarkIn,
  totalUnit,
  UnitMarkGlyph,
} from '@/entities/project'
import { CriterionPips } from '@/entities/plan'
import type {
  PreparationProject,
  PrepSkill,
  PrepTotal,
} from '@/entities/preparation'
import { fmtTime } from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { DoneMark } from '@/shared/ui'

import { usePreparation } from '../model/context'
import {
  dayLabel,
  fr,
  hoursLabel,
  metricValue,
  tint,
  TONE_TEXT,
} from '../model/format'
import {
  FocusSection,
  IconAction,
  LevelGauge,
  DayList,
  SessionTile,
  SubTitle,
} from './bits'

const hourOrder = (a: Activity) =>
  a.all_day || !a.start_at ? -1 : new Date(a.start_at).getTime()

/**
 * La **semaine écoulée** d'un projet (#92, point 4) : ce qu'elle a apporté
 * (Progrès), où en sont ses savoirs (Apprentissage), ce qui reste à traiter
 * et ce qui a été fait (Activités). Les objectifs sont ceux de l'étape en
 * cours, sinon ceux du projet (#91). Jamais de « +0 ».
 */
export function PastWeek({
  prep,
  project,
  colors,
  inkClass,
  domainEmoji,
}: {
  prep: PreparationProject
  project: Project
  colors: DomainColorValues
  /** L'encre du domaine en classe (le disque de `DoneMark`). */
  inkClass: string
  domainEmoji: string
}) {
  const { past } = prep
  const hasProgress =
    past.totals.length > 0 ||
    past.results.length > 0 ||
    past.achievements.length > 0
  const skills = past.learning.filter(
    (s) =>
      s.in_scope && ((s.level >= 1 && s.level <= 3) || s.acquired_this_week),
  )
  return (
    <div className="flex flex-col gap-6">
      <FocusSection title="Progrès">
        {!hasProgress && (
          <p className="text-sm text-muted-foreground">
            Rien à mesurer sur ce périmètre.
          </p>
        )}
        {past.totals.length > 0 && (
          <div className="flex flex-col gap-2">
            <SubTitle>Totaux</SubTitle>
            <div className="grid grid-cols-2 gap-2">
              {past.totals.map((t) => (
                <TotalTile
                  key={t.total_id}
                  total={t}
                  project={project}
                  colors={colors}
                />
              ))}
            </div>
          </div>
        )}
        {past.results.length > 0 && (
          <div className="flex flex-col gap-2">
            <SubTitle>Résultats</SubTitle>
            {past.results.map((r) => (
              <div
                key={r.metric_id}
                className="flex min-h-6 items-center gap-2 text-[13px]"
              >
                <span className="w-5 shrink-0 text-center">
                  {r.emoji || '🎯'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.name}
                </span>
                <span className="font-semibold tabular-nums">
                  {r.best ? metricValue(r.best.value, r.unit) : '—'}
                </span>
                {r.delta != null && (
                  <span className="rounded-[4px] bg-[#DBEDDB] px-1.5 py-px text-[11px] font-semibold text-[#1C3829] tabular-nums">
                    {signed(r.delta, (v) => metricValue(v, r.unit))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {past.achievements.length > 0 && (
          <div className="flex flex-col gap-2">
            <SubTitle>Réalisations</SubTitle>
            {past.achievements.map((a) => (
              <div
                key={a.id}
                className="flex min-h-6 items-center gap-2 text-[13px]"
              >
                <span className="w-5 shrink-0 text-center">
                  {a.emoji || '🏆'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {a.title}
                </span>
                <DoneMark size="row" className={inkClass} />
              </div>
            ))}
          </div>
        )}
      </FocusSection>
      {skills.length > 0 && (
        <FocusSection title="Apprentissage">
          <div className="flex flex-col gap-3">
            {skills.map((s) => (
              <SkillPast
                key={s.skill_id}
                skill={s}
                colors={colors}
                inkClass={inkClass}
              />
            ))}
          </div>
        </FocusSection>
      )}

      <PastActivities prep={prep} colors={colors} domainEmoji={domainEmoji} />
    </div>
  )
}

/** « +30 », « −0:42 » : un écart signé, jamais nul. */
function signed(v: number, format: (abs: number) => string): string {
  return `${v < 0 ? '−' : '+'}${format(Math.abs(v))}`
}

/** Un Total en KPI : le réalisé en gros, sa cible, et ce que la semaine a
 *  apporté (« +2 »), quand elle a apporté quelque chose. */
function TotalTile({
  total: t,
  project,
  colors,
}: {
  total: PrepTotal
  project: Project
  colors: DomainColorValues
}) {
  const total = project.totals.find((x) => x.id === t.total_id)
  const unit = total ? totalUnit(total) : null
  const label = unit ? unitLabel(unit, 2) : ''
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg px-3 py-2.5"
      style={{ background: tint(colors.base, 12) }}
    >
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        {total && (
          <UnitMarkGlyph
            mark={totalMarkIn(total, project)}
            className="text-[11px]"
          />
        )}
        <span className="truncate first-letter:uppercase">{label}</span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span
          className={cn(
            'text-[22px] leading-none font-semibold tabular-nums',
            TONE_TEXT,
          )}
        >
          {fr(t.progress)}
        </span>
        <span className="text-[13px] whitespace-nowrap text-muted-foreground">
          /{fr(t.target)}{' '}
          {total?.mode === 'duration'
            ? 'h'
            : unit
              ? unitLabel(unit, t.target)
              : ''}
        </span>
        {t.gain > 0 && (
          <span
            className={cn(
              'rounded-[4px] px-1.5 py-px text-[11px] font-semibold tabular-nums',
              TONE_TEXT,
            )}
            style={{ background: tint(colors.base, 15) }}
          >
            +{fr(t.gain)}
          </span>
        )}
      </span>
    </div>
  )
}

const PHASE = [
  'Pas commencé',
  'Étude',
  'Pratique',
  'Mise en situation',
  'Acquis',
]

/** Une pièce travaillée dans la semaine écoulée. */
type PastRow = {
  key: string
  emoji: string
  label: string
  /** Les séances faites de la semaine qui l'ont portée. */
  times: number
  /** Le niveau du dernier retour de la semaine (#139). */
  level: number | null
  /** Un objet de pratique : son critère (#157), en pastilles à la place du
   *  niveau, comme sur la tuile de phase. */
  criterion?: { passes: number; level: number; reached: number }
  /** Réussi, interro passée : titre à l'encre, rond coché. */
  finished: boolean
  /** L'état en mots, en infobulle. */
  state: string
}

/** Un savoir sur la semaine écoulée : sa jauge, puis les pièces travaillées
 *  dans la semaine, comme au panneau (#108) — l'étude, l'interro passée, la
 *  pratique et la mise en situation génériques, puis ses objets de pratique.
 *  Chacune dit « n fois » en gris, puis le niveau de son dernier retour de la
 *  semaine (#139) — un objet, les pastilles de son critère (#157, 30/10) ; réussie ou passée : titre à l'encre et rond
 *  coché à la place. Acquis dans la semaine : la jauge pleine et « Acquis »,
 *  rien d'autre. */
function SkillPast({
  skill: s,
  colors,
  inkClass,
}: {
  skill: PrepSkill
  colors: DomainColorValues
  inkClass: string
}) {
  const acquired = s.acquired_this_week || s.level >= 4
  const rows: PastRow[] = []
  // L'étude se lit sur ses passes (#157) : elle ne se « termine » plus d'un
  // geste, sa maîtrise vient de l'interro.
  if (s.study_sessions > 0)
    rows.push({
      key: 'study',
      emoji: '📓',
      label: 'Étude',
      times: s.study_sessions,
      level: null,
      finished: false,
      state: 'En cours',
    })
  if (s.recalls_this_week > 0)
    rows.push({
      key: 'recall',
      emoji: '🧠',
      label: 'Interro',
      times: s.recalls_this_week > 1 ? s.recalls_this_week : 0,
      level: null,
      finished: true,
      state: 'Passée',
    })
  if (s.practice_sessions > 0)
    rows.push({
      key: 'practice',
      emoji: '',
      label: 'Pratique',
      times: s.practice_sessions,
      level: s.practice_last_level,
      finished: false,
      state: 'Pratique libre',
    })
  if (s.application_sessions > 0)
    rows.push({
      key: 'application',
      emoji: '',
      label: 'Mise en situation',
      times: s.application_sessions,
      level: s.application_last_level,
      finished: false,
      state: 'Mise en situation libre',
    })
  for (const it of s.items)
    rows.push({
      key: it.item_id,
      emoji: it.emoji || '🧺',
      label: it.title,
      times: it.sessions_this_week,
      level: it.last_level,
      criterion: {
        passes: it.criterion_passes,
        level: it.criterion_level,
        reached: it.criterion_reached,
      },
      finished: it.completed_this_week,
      state: it.completed_this_week
        ? it.nature === 'situation'
          ? 'Réussie'
          : 'Réussi'
        : it.started_this_week
          ? 'Démarré'
          : 'En cours',
    })
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium">
          {s.name}
        </span>
        <LevelGauge level={acquired ? 4 : s.level} colors={colors} />
        {acquired ? (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
            style={{ background: colors.ink }}
          >
            Acquis
          </span>
        ) : (
          rows.length === 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {PHASE[s.level]}
            </span>
          )
        )}
      </div>
      {!acquired &&
        rows.map((r) => (
          <div
            key={r.key}
            className="flex min-h-6 items-center gap-2 pl-0.5 text-xs"
          >
            <span className="w-4 shrink-0 text-center">{r.emoji}</span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                r.finished && 'font-medium',
              )}
              style={r.finished ? { color: colors.fonce } : undefined}
            >
              {r.label}
            </span>
            <span
              title={
                r.state + (r.level ? ` · dernier niveau ${r.level}/5` : '')
              }
              className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium whitespace-nowrap"
            >
              {r.times > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  {r.times} fois
                </span>
              )}
              {r.finished ? (
                <DoneMark size="block" className={inkClass} />
              ) : r.criterion ? (
                <CriterionPips
                  variant="tile"
                  passes={r.criterion.passes}
                  level={r.criterion.level}
                  reached={r.criterion.reached}
                  ink={colors.ink}
                />
              ) : (
                r.level && <LevelChip level={r.level} dense />
              )}
            </span>
          </div>
        ))}
    </div>
  )
}

/**
 * Les activités de la semaine écoulée, lues en direct. **Faites** : groupées
 * par jour (#145), une ligne par séance, l'heure de début à droite. **Non faites** : chacune avec ses trois
 * gestes en icônes bordées — ✓ Faite, ↻ Reporter (la semaine suivante, même
 * jour, même heure), 🗑 Supprimer —, définitifs ici ; pas de « ratée ». Toute activité de la semaine écoulée
 * non cochée en est une, celles du jour de la préparation comprises, qu'elle
 * porte une interro ou non.
 */
function PastActivities({
  prep,
  colors,
  domainEmoji,
}: {
  prep: PreparationProject
  colors: DomainColorValues
  domainEmoji: string
}) {
  const { gestures } = usePreparation()
  // Le calendrier en direct : une non faite traitée quitte la liste.
  const rows = [...prep.past.missed_activities].sort((a, b) =>
    (a.start_at ?? '').localeCompare(b.start_at ?? ''),
  )
  // Les faites, dans l'ordre du calendrier.
  const sessions = [...prep.past.done_activities].sort(
    (x, y) =>
      (x.start_at ?? '').localeCompare(y.start_at ?? '') ||
      hourOrder(x) - hourOrder(y),
  )
  const doneCount = prep.past.done_activities.length

  return (
    <FocusSection title="Activités">
      <div className="flex flex-col gap-1.5">
        <SubTitle count={doneCount}>Faites</SubTitle>
        <DayList
          items={sessions
            .filter((a) => a.start_at)
            .map((a) => ({
              key: a.id,
              day: new Date(a.start_at as string),
              emoji: a.emoji || domainEmoji,
              title: a.title,
              hour: a.all_day ? '' : fmtTime(a.start_at as string),
              details: a.notes && (
                <p className="whitespace-pre-line">{a.notes}</p>
              ),
            }))}
        />
      </div>
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <SubTitle count={rows.length}>Non faites</SubTitle>
          {rows.map((a) => {
            return (
              <div key={a.id} className="flex items-center gap-2">
                <SessionTile emoji={a.emoji || domainEmoji} colors={colors} />
                <span className="min-w-0 truncate text-sm font-medium">
                  {a.title}
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {a.start_at && dayLabel(new Date(a.start_at))}
                  {!a.all_day &&
                    a.start_at &&
                    ` · ${hoursLabel(a).split(' – ')[0]}`}
                </span>
                <span className="ml-auto flex gap-1.5">
                  {/* Directs et définitifs : on défait au calendrier. */}
                  <IconAction
                    label="Faite"
                    onClick={() => void gestures.markDone(a)}
                  >
                    <Check />
                  </IconAction>
                  <IconAction
                    label="Reporter à la semaine prochaine"
                    onClick={() => void gestures.postpone(a)}
                  >
                    <Redo2 />
                  </IconAction>
                  <IconAction
                    label="Supprimer"
                    onClick={() => gestures.remove(a)}
                  >
                    <Trash2 />
                  </IconAction>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </FocusSection>
  )
}
