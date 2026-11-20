import { type CSSProperties, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Skill } from '@/entities/skill'

const ROW = 24
const FONT = 12
/** Au plus cinq lignes par colonne : au-delà, la cinquième devient « +n »,
 * qui déplie ; « Réduire » replie. */
const MAX = 5

/** Largeur d'un libellé à 12 px, mesurée par le navigateur. */
function measure(): (text: string, bold: boolean) => number {
  const ctx = document.createElement('canvas').getContext('2d')
  const family = getComputedStyle(document.body).fontFamily
  return (text, bold) => {
    if (!ctx) return text.length * (bold ? 7.3 : 6.9)
    ctx.font = `${bold ? 600 : 400} ${FONT}px ${family}`
    return ctx.measureText(text).width
  }
}

/** Une courbe horizontale d'un point à l'autre. */
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2
  return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`
}

/** Une ligne d'une colonne : un savoir, « +n » (déplier) ou « Réduire ». */
type Row = { skill: Skill } | { more: number } | { collapse: true }

/**
 * Une colonne bornée à `MAX` lignes, repliée : une fenêtre de `MAX - 1`
 * savoirs (centrée sur `focus` s'il est donné, bornée aux extrémités ; sinon
 * les premiers), puis « +n ». Dépliée : tous, puis « Réduire ».
 */
function clip(skills: Skill[], expanded: boolean, focus?: number): Row[] {
  const rows: Row[] = skills.map((skill) => ({ skill }))
  if (skills.length <= MAX) return rows
  if (expanded) return [...rows, { collapse: true }]
  const start =
    focus === undefined
      ? 0
      : Math.max(
          0,
          Math.min(
            // Centré sur les `MAX` lignes, « +n » compris : deux au-dessus.
            focus - Math.floor((MAX - 1) / 2),
            skills.length - (MAX - 1),
          ),
        )
  return [
    ...rows.slice(start, start + MAX - 1),
    { more: skills.length - (MAX - 1) },
  ]
}

interface Node {
  key: string
  /** Absent pour « +n » et « Réduire », qui déplient ou replient. */
  to?: string
  label: string
  title?: string
  left: number
  top: number
  width: number
  kind:
    'parent' | 'here' | 'sibling' | 'child' | 'toggle-sibling' | 'toggle-child'
  open?: boolean
}

/**
 * L'extrait d'arbre de la page savoir (design #65 et #69, `kit/Extrait
 * arbre`), sur trois niveaux : le parent (gris, gras) à gauche ; ses enfants —
 * ce savoir en pilule pleine à la couleur du domaine, ses voisins nommés en
 * gris effacé, avec une pastille du domaine si un cycle y est ouvert — ; puis
 * les enfants de ce savoir en pilules teintées. Au plus cinq lignes par
 * colonne : au-delà, « +n » — fenêtre centrée sur ce savoir pour les voisins,
 * les premiers pour les enfants. Un clic sur « +n » déplie les deux colonnes
 * (#72), « Réduire » les replie ; l'extrait grandit, sans défilement. Chaque nœud
 * mène à la page de son savoir.
 *
 * Un savoir de premier niveau a le domaine à la place du parent.
 */
export function TreeExcerpt({
  skill,
  skills,
  domain,
  color,
}: {
  skill: Skill
  /** Tous les savoirs du domaine. */
  skills: Skill[]
  domain: { id: string; name: string; emoji: string | null }
  /** La couleur du domaine (CSS). */
  color: string
}) {
  // Un seul état pour l'extrait : déplier vaut pour les deux colonnes.
  const [expanded, setExpanded] = useState(false)
  const layout = useMemo(() => {
    const width = measure()
    const byOrder = (a: Skill, b: Skill) =>
      a.order - b.order || a.name.localeCompare(b.name)
    const parentSkill = skills.find((s) => s.id === skill.parent_skill_id)
    const found = skills
      .filter((s) => s.parent_skill_id === skill.parent_skill_id)
      .sort(byOrder)
    // La liste du domaine peut ne pas encore porter ce savoir (chargement) :
    // il est toujours dans sa colonne.
    const allSiblings = found.some((s) => s.id === skill.id) ? found : [skill]
    const siblings = clip(
      allSiblings,
      expanded,
      allSiblings.findIndex((s) => s.id === skill.id),
    )
    const children = clip(
      skills.filter((s) => s.parent_skill_id === skill.id).sort(byOrder),
      expanded,
    )

    const parent = parentSkill
      ? { label: parentSkill.name, to: `/skills/${parentSkill.id}` }
      : {
          label: [domain.emoji, domain.name].filter(Boolean).join(' '),
          to: `/domains/${domain.id}`,
        }

    const pill = (text: string, bold: boolean, dot = false) =>
      Math.round(width(text, bold) + 12 + (dot ? 11 : 0))
    const labelOf = (r: Row) =>
      'skill' in r ? r.skill.name : 'more' in r ? `+${r.more}` : 'Réduire'
    const isHere = (r: Row) => 'skill' in r && r.skill.id === skill.id
    const widthOf = (r: Row) =>
      pill(
        labelOf(r),
        !('skill' in r) || isHere(r),
        'skill' in r && r.skill.has_open_cycle,
      )

    const h = Math.max(siblings.length, children.length, 1) * ROW
    const here = Math.max(0, siblings.findIndex(isHere))
    const yS = (i: number) =>
      (h - siblings.length * ROW) / 2 + i * ROW + ROW / 2
    const pw = pill(parent.label, true)
    const cy = yS(here)
    const xS = pw + 40
    const colW = Math.max(...siblings.map(widthOf))
    const iw = widthOf(siblings[here])
    const xK = xS + colW + 36

    const nodes: Node[] = [
      {
        key: 'parent',
        ...parent,
        title: parent.label,
        left: 0,
        top: h / 2 - 10,
        width: pw,
        kind: 'parent',
      },
    ]
    const paths: { d: string; w: number; op: number }[] = []
    siblings.forEach((r, i) => {
      const y = yS(i)
      const base = { left: xS, top: y - 10, width: widthOf(r) }
      if (!('skill' in r)) {
        nodes.push({
          ...base,
          key: 'toggle-siblings',
          label: labelOf(r),
          kind: 'toggle-sibling',
        })
        // « Réduire » n'a pas de courbe ; « +n » garde celle des voisins.
        if ('collapse' in r) return
      } else {
        nodes.push({
          ...base,
          key: r.skill.id,
          to: `/skills/${r.skill.id}`,
          label: r.skill.name,
          title: r.skill.name,
          kind: isHere(r) ? 'here' : 'sibling',
          open: r.skill.has_open_cycle,
        })
      }
      paths.push(
        isHere(r)
          ? { d: curve(pw, h / 2, xS, y), w: 1.75, op: 1 }
          : { d: curve(pw, h / 2, xS, y), w: 1, op: 0.22 },
      )
    })
    let kw = 0
    children.forEach((r, j) => {
      const y = Math.min(
        h - 10,
        Math.max(10, cy + (j - (children.length - 1) / 2) * ROW),
      )
      const w = pill(labelOf(r), !('skill' in r))
      kw = Math.max(kw, w)
      const base = { left: xK, top: y - 10, width: w }
      nodes.push(
        !('skill' in r)
          ? {
              ...base,
              key: 'toggle-children',
              label: labelOf(r),
              kind: 'toggle-child',
            }
          : {
              ...base,
              key: r.skill.id,
              to: `/skills/${r.skill.id}`,
              label: r.skill.name,
              title: r.skill.name,
              kind: 'child',
            },
      )
      if (!('collapse' in r))
        paths.push({ d: curve(xS + iw, cy, xK, y), w: 1.5, op: 0.8 })
    })
    return {
      w: children.length ? xK + kw : xS + colW,
      h,
      nodes,
      paths,
    }
  }, [skill, skills, domain, expanded])

  const soft = `color-mix(in oklab, ${color} 14%, transparent)`
  // Les voisins s'effacent : le gris doux, éclairci vers le fond.
  const faint = 'color-mix(in oklab, var(--muted-foreground) 75%, var(--card))'

  return (
    <nav
      aria-label="Place dans l'arbre"
      className="relative shrink-0"
      style={{
        width: layout.w,
        height: layout.h,
        // Le halo d'un nœud survolé, à la couleur du domaine.
        ...({
          '--halo': `color-mix(in oklab, ${color} 50%, transparent)`,
        } as Record<string, string>),
      }}
    >
      <svg
        aria-hidden
        width={layout.w}
        height={layout.h}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        {layout.paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={color}
            strokeWidth={p.w}
            strokeOpacity={p.op}
            strokeLinecap="round"
          />
        ))}
      </svg>
      {layout.nodes.map((n) => {
        const style: CSSProperties = {
          left: n.left,
          top: n.top,
          width: n.width,
          ...(n.kind === 'parent' && {
            color: 'var(--muted-foreground)',
            fontWeight: 600,
          }),
          ...(n.kind === 'here' && {
            background: color,
            color: '#fff',
            fontWeight: 600,
          }),
          ...(n.kind === 'sibling' && {
            color: faint,
            justifyContent: 'flex-start',
          }),
          ...(n.kind === 'toggle-sibling' && {
            color: 'var(--muted-foreground)',
            fontWeight: 600,
            justifyContent: 'flex-start',
          }),
          ...(n.kind === 'child' && {
            background: soft,
            color: 'var(--foreground)',
          }),
          ...(n.kind === 'toggle-child' && {
            color: 'var(--muted-foreground)',
            fontWeight: 600,
          }),
        }
        const className =
          'absolute box-border flex h-5 items-center justify-center gap-[5px] rounded-[4px] px-1.5 text-xs leading-none whitespace-nowrap'
        if (!n.to)
          return (
            <button
              key={n.key}
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              className={`${className} cursor-pointer hover:text-foreground`}
              style={style}
            >
              {n.label}
            </button>
          )
        return (
          <Link
            key={n.key}
            to={n.to}
            title={n.title}
            aria-current={n.kind === 'here' ? 'page' : undefined}
            className={`${className} hover:shadow-[0_0_0_1.5px_var(--halo)]`}
            style={style}
          >
            {n.label}
            {n.open && (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: n.kind === 'here' ? '#fff' : color }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
