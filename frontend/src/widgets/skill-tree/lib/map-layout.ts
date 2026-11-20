/**
 * La disposition de la carte des savoirs (design #27) — portage de
 * `project/kit/skill-tree.js` (artefact de la maquette), constantes comprises.
 *
 * Une carte mentale à deux côtés autour d'un moyeu : chaque côté est un arbre
 * horizontal. Les frères se posent **par contours** : chaque sous-arbre garde,
 * par niveau, son étendue verticale, et un frère se pose au plus près du
 * précédent sans qu'aucun niveau ne se chevauche — les groupes d'enfants restent
 * centrés sur leur parent. Écart à la maquette : une famille ouverte réserve, à
 * son niveau, toute la hauteur de ses enfants — un frère replié ne se pose plus
 * dans l'éventail de ses courbes.
 */

export const LINE = 20
const ROW_GAP = 16
const COL_GAP_MIN = 56
const COL_GAP_MAX = 200
const COL_GAP_RATIO = 0.2
const CHROME = 12
const BADGE = 26
const NODE_H = LINE

/** Un nœud à disposer. `id` est unique ; `name` n'est qu'un libellé. */
export interface MapInput {
  id: string
  name: string
  children?: MapInput[]
  collapsed?: boolean
}

export interface MapOptions {
  /** Largeur de la boîte du moyeu. */
  domainWidth: number
  /** Air entre le moyeu et le premier niveau. */
  centerGap: number
  /** Place réservée en plus du texte, selon le nœud (anneau, chevron…). */
  extra: (n: MapInput) => number
  /** Largeur imposée (le « + », la place d'un glisser) ; 0 = mesurée. */
  fixedWidth?: (n: MapInput) => number
}

export interface MapNode {
  id: string
  name: string
  depth: number
  /** 1 = à droite du moyeu, -1 = à gauche. */
  dir: 1 | -1
  left: number
  top: number
  w: number
  collapsed: boolean
  /** Nombre d'enfants, affiché une fois replié. */
  count: number
  kidIds: string[]
  parentId: string | null
}

export interface MapPath {
  from: string | null
  to: string
  d: string
}

export interface MapLayout {
  nodes: MapNode[]
  paths: MapPath[]
  width: number
  height: number
  /** La boîte du moyeu. Ses branches partent de ses bords, à `top + 17`. */
  domain: { left: number; top: number; width: number }
}

let ctx: CanvasRenderingContext2D | null | undefined
/** Largeur réelle d'un libellé, mesurée dans la police du nœud. */
function textWidth(s: string): number {
  if (ctx === undefined) {
    ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      const temoin = document.createElement('span')
      temoin.className = 'text-[13px] font-medium'
      temoin.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap'
      document.body.appendChild(temoin)
      const st = getComputedStyle(temoin)
      ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`
      temoin.remove()
    }
  }
  return ctx ? ctx.measureText(s).width : s.length * 7.1
}

const labelWidth = (s: string, extra = 0) => CHROME + textWidth(s) + extra + 2

const courbe = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = (x2 - x1) / 2
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

interface Plan {
  n: MapInput
  kids: Plan[]
  offs: number[]
  contour: Map<number, [number, number]>
}

export function buildMap(
  sides: { right: MapInput[]; left: MapInput[] },
  opts: MapOptions,
): MapLayout {
  const DW = opts.domainWidth
  const CG = opts.centerGap
  const raw: (Omit<MapNode, 'left' | 'top'> & { x: number; y: number })[] = []
  const edges: [string, string][] = []

  const open = (n: MapInput) => Boolean(n.children?.length) && !n.collapsed
  const extras = (n: MapInput) =>
    (n.children?.length && n.collapsed ? BADGE : 0) + opts.extra(n)
  const largeur = (n: MapInput) =>
    opts.fixedWidth?.(n) || labelWidth(n.name, extras(n))

  const layoutSide = (roots: MapInput[], dir: 1 | -1) => {
    // 1. Largeur de chaque colonne : le plus long libellé du niveau.
    const colW = new Map<number, number>()
    const mesure = (list: MapInput[], depth: number) =>
      list.forEach((n) => {
        colW.set(depth, Math.max(colW.get(depth) ?? 0, largeur(n)))
        if (open(n)) mesure(n.children!, depth + 1)
      })
    mesure(roots, 1)

    // 2. Placement par contours.
    const step = NODE_H + ROW_GAP
    const plan = (n: MapInput): Plan => {
      const contour = new Map<number, [number, number]>([[0, [0, 0]]])
      if (!open(n)) return { n, kids: [], offs: [], contour }
      const kids = n.children!.map(plan)
      const offs: number[] = []
      const bas = new Map<number, number>()
      kids.forEach((p, k) => {
        // 12 px de plus entre deux frères dont l'un est une famille dépliée.
        const air = k && (kids[k - 1].kids.length || p.kids.length) ? 12 : 0
        let off = k ? offs[k - 1] + step + air : 0
        if (k)
          p.contour.forEach(([mn], d) => {
            if (bas.has(d)) off = Math.max(off, bas.get(d)! + step + air - mn)
          })
        offs.push(off)
        p.contour.forEach(([, mx], d) =>
          bas.set(d, Math.max(bas.get(d) ?? -Infinity, off + mx)),
        )
      })
      const mid = (offs[0] + offs[offs.length - 1]) / 2
      const centres = offs.map((o) => o - mid)
      kids.forEach((p, k) =>
        p.contour.forEach(([mn, mx], d) => {
          const c = contour.get(d + 1)
          contour.set(
            d + 1,
            c
              ? [
                  Math.min(c[0], centres[k] + mn),
                  Math.max(c[1], centres[k] + mx),
                ]
              : [centres[k] + mn, centres[k] + mx],
          )
        }),
      )
      // Une famille ouverte réserve, à son propre niveau, la hauteur de ses
      // enfants : un frère se pose au-dessus ou au-dessous de l'éventail,
      // jamais dedans, où les courbes le traverseraient.
      const [mn, mx] = contour.get(1)!
      contour.set(0, [Math.min(0, mn), Math.max(0, mx)])
      return { n, kids, offs: centres, contour }
    }
    const first = raw.length
    const poser = (
      p: Plan,
      depth: number,
      y: number,
      parentId: string | null,
    ) => {
      const n = p.n
      const node = {
        id: n.id,
        name: n.name,
        depth,
        y,
        x: 0,
        dir,
        collapsed: Boolean(n.collapsed && n.children?.length),
        count: n.collapsed && n.children ? n.children.length : 0,
        kidIds: [] as string[],
        parentId,
        w: Math.min(colW.get(depth)!, largeur(n)),
      }
      raw.push(node)
      p.kids.forEach((k, idx) => {
        const kid = poser(k, depth + 1, y + p.offs[idx], n.id)
        node.kidIds.push(kid.id)
        edges.push([n.id, kid.id])
      })
      return node
    }
    const tronc = plan({ id: '', name: '', children: roots })
    tronc.kids.forEach((k, idx) => poser(k, 1, tronc.offs[idx], null))
    const side = raw.slice(first)

    // 3. Écart de colonne proportionnel à l'étalement des enfants.
    const byId = new Map(side.map((n) => [n.id, n]))
    const spread = new Map<number, number>()
    side
      .filter((n) => n.kidIds.length)
      .forEach((n) => {
        const ys = n.kidIds.map((id) => byId.get(id)!.y)
        const e = Math.max(...ys) - Math.min(...ys)
        spread.set(
          n.depth,
          Math.max(spread.get(n.depth) ?? 0, e * COL_GAP_RATIO),
        )
      })
    const gap = (d: number) =>
      Math.min(COL_GAP_MAX, Math.max(COL_GAP_MIN, spread.get(d) ?? 0))
    const colX = new Map<number, number>()
    let x = DW / 2 + CG
    for (let d = 1; colW.has(d); d++) {
      colX.set(d, x)
      x += colW.get(d)! + gap(d)
    }
    side.forEach((n) => (n.x = colX.get(n.depth)!))
  }

  layoutSide(sides.right, 1)
  layoutSide(sides.left, -1)

  const ys = raw.map((n) => n.y)
  const top = Math.min(...ys, -NODE_H / 2) - 4
  const bottom = Math.max(...ys, NODE_H / 2) + NODE_H + 4
  const edge = (d: number) =>
    Math.max(...raw.filter((n) => n.dir === d).map((n) => n.x + n.w), DW / 2)
  const ox = edge(-1)
  const nodes: MapNode[] = raw.map(({ x, y, ...n }) => ({
    ...n,
    left: n.dir === 1 ? ox + x : ox - x - n.w,
    top: y - top,
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const H = NODE_H / 2
  // Le moyeu est centré sur y = 0.
  const domain = { left: ox - DW / 2, top: -top + H - 17, width: DW }
  const yc = domain.top + 17

  const paths: MapPath[] = edges.map(([a, b]) => {
    const f = byId.get(a)!
    const t = byId.get(b)!
    return {
      from: a,
      to: b,
      d: courbe(
        f.dir === 1 ? f.left + f.w : f.left,
        f.top + H,
        t.dir === 1 ? t.left : t.left + t.w,
        t.top + H,
      ),
    }
  })
  // Branches racines : droites quand la racine est à la hauteur du moyeu.
  nodes
    .filter((n) => n.depth === 1)
    .forEach((n) => {
      const x1 = n.dir === 1 ? domain.left + DW : domain.left
      const x2 = n.dir === 1 ? n.left : n.left + n.w
      paths.push({
        from: null,
        to: n.id,
        d:
          Math.abs(n.top + H - yc) < 1
            ? `M ${x1} ${yc} L ${x2} ${yc}`
            : courbe(x1, yc, x2, n.top + H),
      })
    })

  return { nodes, paths, width: ox + edge(1), height: bottom - top, domain }
}
