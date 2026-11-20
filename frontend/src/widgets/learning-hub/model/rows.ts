import type { Activity } from '@/entities/activity'
import type { OverviewGroup, OverviewItem } from '@/entities/learning'
import { PHASES } from '@/entities/plan'
import { fmtShortDate, fmtTime, startOfDay } from '@/shared/lib/date'

/**
 * Les libellés de la vue d'ensemble (#152, #155, `prod/Apprentissage`). Le
 * serveur dit **ce qui** est à faire, en données ; on compose ici ce que
 * chaque ligne en dit. Pur : ni React, ni requête.
 */

/** Les cartes « Actions rapides » (ex-« À faire ») : leur titre et leur en-tête teinté. */
export const GROUPS: Record<OverviewGroup, { title: string; head: string }> = {
  catch_up: {
    title: 'Rattraper',
    head: 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  },
  advance: {
    title: 'Avancer',
    head: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  plan: {
    title: 'Planifier',
    head: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  start: { title: 'Commencer', head: 'bg-muted/35 text-muted-foreground' },
}

/** L'en-tête d'une carte vide : gris, quelle que soit la carte. */
export const EMPTY_HEAD = 'bg-muted/35 text-muted-foreground'

const PHASE_LABEL = new Map(PHASES.map((p) => [p.key as string, p.label]))
export const phaseLabel = (phase: string | null | undefined) =>
  (phase && PHASE_LABEL.get(phase)) || 'Séance'

/** L'emoji d'une phase : le carnet pour l'étude, celui du domaine sinon. */
export const phaseEmoji = (phase: string | null | undefined, domain: string) =>
  phase === 'study' ? '📓' : domain

const at = (iso: string) => new Date(`${iso}T00:00:00`)

/** « lun. 12 » à moins d'une semaine (passée ou à venir), la date courte
 *  au-delà. */
export function dayLabel(d: Date, today = new Date()): string {
  const days = (startOfDay(today).getTime() - startOfDay(d).getTime()) / 864e5
  return Math.abs(days) < 7
    ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
    : fmtShortDate(d)
}

/** Une séance qui ne porte que l'interro (« Interro · savoir », #82). */
export const onlyRecall = (a: Activity) =>
  a.acts.length > 0 && a.acts.every((x) => x.kind === 'recall')

/** Les pièces qu'une séance porte, nommées : l'objet, sinon la phase. */
export function piecesOf(activity: Activity): string {
  const names = activity.acts.map((a) =>
    a.kind === 'recall'
      ? 'Interro'
      : a.kind === 'study'
        ? 'Étude'
        : (a.item_title ?? phaseLabel(a.nature ?? 'isolated')),
  )
  return [...new Set(names)].join(' · ')
}

/** L'emoji de la première pièce d'une séance : celui de l'objet, le carnet
 *  pour l'étude, le cerveau pour l'interro ; sinon celui de la séance. */
export function pieceEmoji(activity: Activity, domainEmoji: string): string {
  const act = activity.acts.find((a) => a.kind !== 'recall') ?? activity.acts[0]
  if (!act) return activity.emoji || domainEmoji
  if (act.kind === 'recall') return '🧠'
  if (act.kind === 'study') return '📓'
  return act.item_emoji || activity.emoji || domainEmoji
}

/** Une pièce d'une séance, en étiquette (#165) : son savoir au survol, la
 *  teinte du domaine de ce savoir. */
export interface SessionChip {
  key: string
  emoji: string
  title: string
  skill: string
  colors: { base: string; ink: string }
  /** L'acte qui la porte : une pièce qui a sa fiche l'ouvre (27/10). */
  act: Activity['acts'][number]
}

/** La pièce qu'une étiquette ouvre : son savoir, son cycle, son acte —
 *  la page la passe à la fiche (`widgets/piece-sheet-host`). */
export interface PieceOpen {
  skillId: string
  planId: string
  act: Activity['acts'][number]
}

/** Une étiquette ouvre la fiche de sa pièce, si elle en a une : pas l'étude
 *  (sa fiche n'existe pas), ni un acte sans cycle. */
export const pieceOpenOf = (chip: SessionChip): PieceOpen | null =>
  chip.act.kind !== 'study' && chip.act.plan_id
    ? { skillId: chip.act.skill_id, planId: chip.act.plan_id, act: chip.act }
    : null

/** Ce qu'une étiquette dit d'un savoir. */
export interface ChipSkill {
  name: string
  emoji: string
  colors: { base: string; ink: string }
}

const GENERIC = {
  isolated: 'Pratique libre',
  situation: 'Mise en situation libre',
}

/** Les étiquettes d'une séance, dans l'ordre de ses actes — tous ses savoirs
 *  à la suite, chaque pièce une fois. */
export function sessionChips(
  activity: Activity,
  skillOf: (skillId: string) => ChipSkill,
): SessionChip[] {
  const seen = new Set<string>()
  return activity.acts.flatMap((a) => {
    const key = [a.skill_id, a.kind, a.practice_item_id ?? a.nature ?? ''].join(
      ':',
    )
    if (seen.has(key)) return []
    seen.add(key)
    const skill = skillOf(a.skill_id)
    const [emoji, title] =
      a.kind === 'recall'
        ? ['🧠', 'Interro']
        : a.kind === 'study'
          ? ['📓', 'Étude']
          : a.practice_item_id
            ? [a.item_emoji || skill.emoji, a.item_title ?? 'Objet']
            : ['🌱', GENERIC[a.nature ?? 'isolated']]
    return [
      { key, emoji, title, skill: skill.name, colors: skill.colors, act: a },
    ]
  })
}

/** Ce qu'une ligne affiche : emoji, titre, chip éventuelle, le « pourquoi ».
 *  `whole` : la ligne **est** le savoir — pas d'en-tête de savoir au-dessus,
 *  son nom en titre (il ouvre le savoir). `aside` : un mot secondaire juste
 *  après le titre, sur la même ligne. */
export interface RowText {
  emoji: string
  title: string
  chip?: { label: string; tone: 'rose' | 'neutral' }
  reason: string
  whole?: boolean
  aside?: string
  /** Les pièces de la séance en étiquettes, sous le titre (#165). */
  chips?: boolean
}

export function rowText(item: OverviewItem, domainEmoji: string): RowText {
  const a = item.activity
  switch (item.kind) {
    case 'session':
      // L'activité et son heure, ses pièces en étiquettes dessous (#165) —
      // la séance qui ne porte que l'interro comprise (27/10).
      return {
        emoji: a && onlyRecall(a) ? '🧠' : a?.emoji || domainEmoji,
        title:
          a?.start_at && !a.all_day
            ? `${a.title} · ${fmtTime(a.start_at)}`
            : (a?.title ?? ''),
        reason: '',
        chips: true,
      }
    case 'recall':
      return {
        emoji: '🧠',
        title: 'Interro',
        chip: item.since
          ? { label: `depuis ${dayLabel(at(item.since))}`, tone: 'rose' }
          : undefined,
        reason: '',
      }
    case 'missed':
      return {
        emoji: a ? pieceEmoji(a, domainEmoji) : domainEmoji,
        title: a?.title ?? '',
        chip: { label: 'non faite', tone: 'rose' },
        reason: a
          ? [a.start_at && dayLabel(new Date(a.start_at)), piecesOf(a)]
              .filter(Boolean)
              .join(' · ')
          : '',
      }
    case 'next_phase':
      return {
        emoji: phaseEmoji(item.phase, domainEmoji),
        title: phaseLabel(item.phase),
        reason: `${phaseLabel(item.previous_phase)} ${
          item.previous_phase === 'study' ? 'maîtrisée' : 'validée'
        } · rien de posé`,
      }
    case 'start_recall':
      return { emoji: '🧠', title: 'Interro', reason: 'pas lancée' }
    case 'close':
      return {
        emoji: domainEmoji,
        title: item.skill_name,
        reason: 'Apprentissage terminé',
        whole: true,
      }
    case 'unplanned':
      return {
        emoji: phaseEmoji(item.phase, domainEmoji),
        title: phaseLabel(item.phase),
        reason: `${
          item.since
            ? `dernière séance ${fmtShortDate(at(item.since))}`
            : 'jamais travaillé'
        } · rien de prévu`,
      }
    case 'start':
      return {
        emoji: domainEmoji,
        title: item.skill_name,
        // Une seule ligne : le savoir, puis son projet en secondaire.
        reason: '',
        aside: item.project_name ?? undefined,
        whole: true,
      }
  }
}

/**
 * Les lignes d'une carte, groupées par savoir : un en-tête par savoir, dans
 * l'ordre où il apparaît, ses lignes dessous dans l'ordre du serveur. Une
 * ligne qui est le savoir (`whole`) reste seule, sans en-tête.
 */
export type CardEntry =
  | { type: 'head'; skillId: string; skillName: string }
  | { type: 'row'; item: OverviewItem; grouped: boolean }

export function groupBySkill(
  items: OverviewItem[],
  isWhole: (item: OverviewItem) => boolean,
): CardEntry[] {
  const order: string[] = []
  const bySkill = new Map<string, OverviewItem[]>()
  for (const item of items) {
    const key = isWhole(item) ? `whole:${order.length}` : item.skill_id
    if (!bySkill.has(key)) {
      order.push(key)
      bySkill.set(key, [])
    }
    bySkill.get(key)!.push(item)
  }
  return order.flatMap((key): CardEntry[] => {
    const rows = bySkill.get(key)!
    if (key.startsWith('whole:'))
      return [{ type: 'row', item: rows[0], grouped: false }]
    return [
      {
        type: 'head',
        skillId: rows[0].skill_id,
        skillName: rows[0].skill_name,
      },
      ...rows.map((item) => ({ type: 'row' as const, item, grouped: true })),
    ]
  })
}

/** Les 7 jours qui suivent aujourd'hui (demain → J+7), au jour local. */
export function nextDays(today = new Date()): Date[] {
  const start = startOfDay(today)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i + 1)
    return d
  })
}
