import {
  Check,
  ChevronRight,
  Link,
  LocateFixed,
  Minimize2,
  Plus,
  Unlink,
} from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { DomainColorValues } from '@/entities/domain'
import { buildSkillTree, type Skill, type SkillNode } from '@/entities/skill'
import { cn } from '@/shared/lib/utils'

import { buildMap, type MapInput, type MapNode } from '../lib/map-layout'

const PHASES = ['Étude', 'Pratique', 'Mise en situation', 'Rétention']
const GRIS = 'var(--color-muted-foreground)'

/** Les identifiants des nœuds fantômes : le « + » d'un parent, le champ de création. */
const PLUS = 'plus:'
const CREATE = 'create:'
/** La place réservée pendant un glisser, et le moyeu comme cible. */
const PLACE = 'place:'
const HUB = '__hub__'
type Zone = 'in' | 'before' | 'after'
const ghostId = (id: string) =>
  id.startsWith(PLUS) || id.startsWith(CREATE) || id.startsWith(PLACE)

export interface SkillMapProps {
  skills: Skill[]
  domainEmoji?: string | null
  color: DomainColorValues
  /** Les savoirs visés et leur niveau (0 pas commencé → 4 acquis). */
  levels: Map<string, number>
  /** `read` : la vue Carte, sans rattachement ni glisser. */
  mode: 'read' | 'edit'
  openSkillId?: string | null
  onOpenSkill?: (id: string) => void
  /** Rattacher : le savoir arrive hors séquence. */
  onAttach?: (id: string) => void
  /** Détacher ; `closeCycle` abandonne le cycle ouvert. */
  onDetach?: (id: string) => void
  /** Créer un savoir sous ce parent (nul = à la racine), et le rattacher. */
  onCreate?: (name: string, parentId: string | null) => void
  /** Ranger un savoir sous un parent (nul = racine), à un rang (absent = dernier). */
  onMove?: (id: string, parentId: string | null, index?: number) => void
  /** Le mode rattachement change : la page estompe ce qu'il faut. */
  onAttachModeChange?: (on: boolean) => void
  /** Fenêtre de détachement, rendue par l'appelant. */
  renderDetach?: (skillId: string, close: () => void) => ReactNode
  /**
   * Le choix des savoirs de la création (design #33, kit/Savoirs
   * `seulArbre` + `rattacher`) : l'arbre seul, en mode rattachement d'emblée,
   * à la hauteur de son cadre — ni bouton-outil, ni plein écran.
   */
  picker?: boolean
}

/**
 * La carte des savoirs d'un projet (design #27, `prod/Savoirs`) : le moyeu du
 * domaine au centre, ses branches de part et d'autre, chaque savoir visé avec
 * l'anneau de sa phase. Les parents hors projet restent visibles mais
 * neutres. Par défaut la carte s'ouvre jusqu'au niveau 2.
 *
 * En édition, le bouton-outil passe en **mode rattachement** : tout le domaine
 * se montre, chaque nœud porte un lien — entier s'il est rattaché, brisé sinon
 * —, et un « + » sous chaque parent crée un savoir sur place.
 */
export function SkillMap({
  skills,
  domainEmoji,
  color,
  levels,
  mode,
  openSkillId,
  onOpenSkill,
  onAttach,
  onCreate,
  onMove,
  onAttachModeChange,
  renderDetach,
  picker = false,
}: SkillMapProps) {
  const [attach, setAttach] = useState(picker)
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState<{ parent: string | null } | null>(
    null,
  )
  const [draft, setDraft] = useState('')
  const [detaching, setDetaching] = useState<string | null>(null)
  const [hoverChevron, setHoverChevron] = useState<string | null>(null)
  const [hoverLink, setHoverLink] = useState<string | null>(null)
  const [hoverHub, setHoverHub] = useState(false)
  const [view, setView] = useState({ z: 1, px: 0, py: 0 })
  // Plein écran : la carte prend toute la fenêtre, le panneau du savoir
  // (z-50) passe toujours au-dessus. Échap en sort.
  const [full, setFull] = useState(false)
  const [boxH, setBoxH] = useState(0)
  const [boxW, setBoxW] = useState(800)
  // Juste après un lâcher, la carte glisse vers son nouveau cadre au lieu d'y sauter.
  const [fondu, setFondu] = useState(false)
  const fonduT = useRef<ReturnType<typeof setTimeout>>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  )
  const edit = mode === 'edit'

  useEffect(() => onAttachModeChange?.(attach), [attach, onAttachModeChange])
  // Changer de mode — ou de cadre, plein écran compris — change l'arbre
  // montré ou sa place : le cadrage d'avant ne vaut plus.
  useEffect(() => setView({ z: 1, px: 0, py: 0 }), [attach, mode, full])

  // --- L'arbre du domaine, et ce qu'on en montre -------------------------------
  const tree = useMemo(() => buildSkillTree(skills), [skills])
  const depthOf = useMemo(() => {
    const m = new Map<string, number>()
    const walk = (l: SkillNode[], d: number) =>
      l.forEach((n) => {
        m.set(n.id, d)
        walk(n.children, d + 1)
      })
    walk(tree, 1)
    return m
  }, [tree])
  const inScope = (id: string) => levels.has(id)
  // Par défaut, ouvert jusqu'au niveau 2 : les parents de niveau 2 et plus sont repliés.
  const isFolded = (id: string) => folded[id] ?? (depthOf.get(id) ?? 1) >= 2

  // Deux côtés équilibrés : la plus grosse branche du côté le plus léger.
  const sides = useMemo(() => {
    const leaves = (n: SkillNode): number =>
      n.children.length ? n.children.reduce((t, c) => t + leaves(c), 0) : 1
    const right: SkillNode[] = []
    const left: SkillNode[] = []
    let wr = 0
    let wl = 0
    ;[...tree]
      .map((r) => ({ r, w: leaves(r) }))
      .sort((a, b) => b.w - a.w)
      .forEach(({ r, w }) => {
        if (wr <= wl) {
          right.push(r)
          wr += w
        } else {
          left.push(r)
          wl += w
        }
      })
    const order = new Map(tree.map((r, i) => [r.id, i]))
    const byOrder = (a: SkillNode, b: SkillNode) =>
      order.get(a.id)! - order.get(b.id)!
    return { right: right.sort(byOrder), left: left.sort(byOrder) }
  }, [tree])

  const filtered = useMemo(() => {
    const keep = (n: SkillNode): MapInput | null => {
      const kids = n.children.map(keep).filter((k): k is MapInput => k !== null)
      if (!(attach || inScope(n.id) || kids.length)) return null
      if (attach) {
        if (creating?.parent === n.id)
          kids.push({ id: CREATE + n.id, name: 'Nouveau savoir' })
        else if (n.children.length > 0 || kids.length > 0)
          kids.push({ id: PLUS + n.id, name: '+' })
      }
      return {
        id: n.id,
        name: n.name,
        children: kids.length ? kids : undefined,
        // En mode rattachement, rien ne se replie.
        collapsed: !attach && isFolded(n.id),
      }
    }
    const side = (l: SkillNode[]) =>
      l.map(keep).filter((k): k is MapInput => k !== null)
    const right = side(sides.right)
    const left = side(sides.left)
    if (attach && creating?.parent === null)
      right.push({ id: CREATE + 'root', name: 'Nouveau savoir' })
    return { right, left }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sides, attach, folded, levels, creating, depthOf])

  const lay = (input: typeof filtered, placeWidth = 80) => {
    const several = input.right.length > 1 || input.left.length > 1
    return buildMap(input, {
      domainWidth: 56,
      centerGap: several ? 110 : 28,
      extra: (n) => {
        if (n.id.startsWith(PLUS) || n.id.startsWith(CREATE)) return 0
        const parent = Boolean(n.children?.length)
        // La place de l'anneau (ou du lien), puis celle du chevron.
        const mark = attach ? 26 : parent && !inScope(n.id) ? 0 : 23
        return mark + (!attach && parent ? 16 : 0)
      },
      fixedWidth: (n) =>
        n.id.startsWith(PLUS)
          ? 34
          : n.id.startsWith(CREATE)
            ? 150
            : n.id.startsWith(PLACE)
              ? placeWidth
              : 0,
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => lay(filtered), [filtered, attach, levels])

  // --- Le cadre : largeur disponible, échelle, zoom, déplacement ---------------
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setBoxW(el.clientWidth)
      setBoxH(el.clientHeight)
    })
    ro.observe(el)
    setBoxW(el.clientWidth)
    setBoxH(el.clientHeight)
    return () => ro.disconnect()
  }, [])
  const marge = mode === 'read' ? 32 : attach ? 48 + 220 : 48
  const fit = Math.min(
    1,
    (boxW - marge) / base.width,
    // En plein écran, la hauteur borne aussi : l'arbre tient dans la fenêtre.
    (full || picker) && boxH ? (boxH - 72) / base.height : Infinity,
  )
  const height = full
    ? '100svh'
    : picker
      ? '100%'
      : Math.max(
          mode === 'read' ? 160 : 240,
          Math.ceil(base.height * fit) + (mode === 'read' ? 40 : 72),
        )
  useEffect(() => {
    if (!full) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', key)
    }
  }, [full])
  const scale = fit * view.z

  // --- Glisser un savoir dans la carte : il se range dessous, avant ou après ---
  // Une étiquette suit le pointeur, l'arbre reste ancré sur le moyeu. La cible
  // se lit sur l'arbre SANS la place réservée — la place décale les voisins,
  // pas les zones de capture, et rien n'oscille. Toute nouvelle cible attend
  // que le pointeur s'y pose 150 ms.
  const [glisse, setGlisse] = useState<{
    id: string
    name: string
    cx: number
    cy: number
  } | null>(null)
  const [target, setTarget] = useState<{ id: string; zone: Zone } | null>(null)
  const drag = useRef<{
    id: string
    name: string
    x: number
    y: number
    moved: boolean
    forbidden: Set<string>
    offX: number
    offY: number
    w: number
    h: number
  } | null>(null)
  const waiting = useRef<{ id: string | null; zone: Zone | null } | null>(null)
  const waitT = useRef<ReturnType<typeof setTimeout>>(undefined)
  const swallowClick = useRef(false)
  const live = useRef({ base, scale, view, target, skills })
  live.current = { base, scale, view, target, skills }

  const skillById = useMemo(
    () => new Map(skills.map((s) => [s.id, s])),
    [skills],
  )
  const descendants = (id: string) => {
    const out = new Set([id])
    const walk = (pid: string) =>
      skills
        .filter((s) => s.parent_skill_id === pid)
        .forEach((s) => {
          out.add(s.id)
          walk(s.id)
        })
    walk(id)
    return out
  }
  /** Les frères, dans l'ordre du serveur (ordre, puis nom). */
  const siblingsOf = (all: Skill[], parent: string | null) =>
    all
      .filter((s) => s.parent_skill_id === parent)
      .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : 1))

  useEffect(() => {
    const hit = (cx: number, cy: number) => {
      const d = drag.current!
      const {
        base: b,
        scale: sc,
        view: v,
        target: cur,
        skills: all,
      } = live.current
      const br = box.current!.getBoundingClientRect()
      const px = (cx - (br.left + br.width / 2) - v.px) / sc + b.width / 2
      const py = (cy - (br.top + br.height / 2) - v.py) / sc + b.height / 2
      let best: { id: string; zone: Zone; dist: number } | null = null
      for (const n of b.nodes) {
        if (ghostId(n.id) || d.forbidden.has(n.id)) continue
        if (px < n.left - 10 || px > n.left + Math.max(n.w, 60) + 10) continue
        const dy = py - (n.top + 10)
        if (Math.abs(dy) > 22) continue
        const zone: Zone =
          Math.abs(dy) <= 6 ? 'in' : dy < 0 ? 'before' : 'after'
        if (!best || Math.abs(dy) < best.dist)
          best = { id: n.id, zone, dist: Math.abs(dy) }
      }
      // Hystérésis : la cible actuelle garde la main tant que la nouvelle n'est
      // pas nettement meilleure.
      if (
        best &&
        cur &&
        cur.id !== HUB &&
        (best.id !== cur.id || best.zone !== cur.zone)
      ) {
        const n = b.nodes.find((x) => x.id === cur.id)
        const off = (z: Zone) => (z === 'before' ? -18 : z === 'after' ? 18 : 0)
        if (n && px >= n.left - 16 && px <= n.left + Math.max(n.w, 60) + 16) {
          const bn = b.nodes.find((x) => x.id === best!.id)!
          const dCur = Math.abs(py - (n.top + 10 + off(cur.zone)))
          const dNew = Math.abs(py - (bn.top + 10 + off(best.zone)))
          if (dCur < dNew + 6 && dCur < 26) return cur
        }
      }
      // Juste avant ou après sa propre place : il ne bougerait pas.
      if (best && best.zone !== 'in') {
        const me = all.find((x) => x.id === d.id)
        const sib = siblingsOf(all, me?.parent_skill_id ?? null)
        const k = sib.findIndex((x) => x.id === d.id)
        if (
          (best.zone === 'after' && sib[k - 1]?.id === best.id) ||
          (best.zone === 'before' && sib[k + 1]?.id === best.id)
        )
          return null
      }
      return best ? { id: best.id, zone: best.zone } : null
    }
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
      d.moved = true
      setGlisse({ id: d.id, name: d.name, cx: e.clientX, cy: e.clientY })
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const onHub = el?.closest('[data-hub]')
      const t = onHub
        ? { id: HUB, zone: 'in' as Zone }
        : hit(e.clientX, e.clientY)
      const cur = live.current.target
      if (
        (t?.id ?? null) === (cur?.id ?? null) &&
        (t?.zone ?? null) === (cur?.zone ?? null)
      ) {
        clearTimeout(waitT.current)
        waiting.current = null
        return
      }
      if (onHub) {
        clearTimeout(waitT.current)
        waiting.current = null
        setTarget(t)
        return
      }
      const w = waiting.current
      if (w && w.id === (t?.id ?? null) && w.zone === (t?.zone ?? null)) return
      clearTimeout(waitT.current)
      waiting.current = { id: t?.id ?? null, zone: t?.zone ?? null }
      waitT.current = setTimeout(() => {
        if (drag.current) setTarget(t)
        waiting.current = null
      }, 150)
    }
    const up = () => {
      clearTimeout(waitT.current)
      waiting.current = null
      const d = drag.current
      drag.current = null
      if (!d?.moved) return
      swallowClick.current = true
      setTimeout(() => (swallowClick.current = false), 0)
      const t = live.current.target
      clearTimeout(fonduT.current)
      setFondu(true)
      fonduT.current = setTimeout(() => setFondu(false), 400)
      setGlisse(null)
      setTarget(null)
      if (t) drop(d.id, t)
    }
    const click = (e: MouseEvent) => {
      if (!swallowClick.current) return
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('click', click, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Appelée depuis l'écoute du glisser, posée une fois : elle lit les savoirs
  // à jour dans `live`, pas ceux du rendu où l'écoute est née — un savoir
  // créé depuis y manquerait, et on l'enverrait à la racine, au rang -1.
  function drop(id: string, t: { id: string; zone: Zone }) {
    if (t.id === HUB) return onMove?.(id, null)
    if (t.zone === 'in') {
      setFolded((f) => ({ ...f, [t.id]: false }))
      return onMove?.(id, t.id)
    }
    const all = live.current.skills
    const target = all.find((x) => x.id === t.id)
    if (!target) return
    const parent = target.parent_skill_id
    const sib = siblingsOf(all, parent).filter((x) => x.id !== id)
    const k = sib.findIndex((x) => x.id === t.id)
    if (k < 0) return
    onMove?.(id, parent, t.zone === 'before' ? k : k + 1)
  }

  function grab(e: React.MouseEvent, n: MapNode) {
    if (e.button !== 0 || !edit || !onMove || ghostId(n.id)) return
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = {
      id: n.id,
      name: n.name,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      forbidden: descendants(n.id),
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      w: r.width,
      h: r.height,
    }
  }

  // L'arbre montré : avec la place réservée, recalé sur le moyeu.
  const shown = useMemo(() => {
    if (!glisse || !target || target.zone === 'in' || target.id === HUB)
      return { layout: base, dx: 0, dy: 0 }
    const copy = JSON.parse(JSON.stringify(filtered)) as typeof filtered
    const insert = (l: MapInput[]): boolean => {
      for (let k = 0; k < l.length; k++) {
        if (l[k].id === target.id) {
          l.splice(target.zone === 'before' ? k : k + 1, 0, {
            id: PLACE,
            name: glisse.name,
          })
          return true
        }
        if (l[k].children && insert(l[k].children!)) return true
      }
      return false
    }
    if (!(insert(copy.right) || insert(copy.left)))
      return { layout: base, dx: 0, dy: 0 }
    const t = lay(copy, (drag.current?.w ?? 80) / scale)
    return {
      layout: t,
      dx: base.domain.left - t.domain.left,
      dy: base.domain.top - t.domain.top,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glisse?.name, target, base, filtered])
  const layout = shown.layout

  // Le zoom : la molette (ou le pincement du trackpad) sur la carte. Choix du
  // user : la carte capte le défilement quand le pointeur la survole.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      // Le zoom se fige pendant qu'on glisse un savoir.
      if (drag.current?.moved) return
      // Proportionnel au geste, pas un cran fixe par événement : un trackpad
      // en émet des dizaines par glissé, une molette un par cran (~100 px).
      // Le pincement (ctrlKey) arrive en petits deltas : il zoome plus vite.
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const k = e.ctrlKey ? 0.01 : 0.0015
      const f = Math.exp(-Math.max(-50, Math.min(50, px)) * k)
      setView((v) => ({
        ...v,
        z: Math.min(3, Math.max(0.4, v.z * f)),
      }))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const p = pan.current
      if (!p) return
      setView((v) => ({
        ...v,
        px: p.px + e.clientX - p.x,
        py: p.py + e.clientY - p.y,
      }))
    }
    const up = () => (pan.current = null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  const toggleFold = (id: string) =>
    setFolded((f) => ({ ...f, [id]: !isFolded(id) }))
  /** Le moyeu : tout replier si quelque chose est ouvert, sinon tout déplier. */
  function toggleAll() {
    const parents = [...depthOf.keys()].filter((id) =>
      skills.some((s) => s.parent_skill_id === id),
    )
    const someOpen = parents.some((id) => !isFolded(id))
    setFolded(Object.fromEntries(parents.map((id) => [id, someOpen])))
  }

  /** Le parent d'un « + » ou d'un champ de création, pour son infobulle. */
  function ghostParentName(id: string) {
    const pid = id.startsWith(PLUS)
      ? id.slice(PLUS.length)
      : id.startsWith(CREATE)
        ? id.slice(CREATE.length)
        : null
    return pid ? skillById.get(pid)?.name : undefined
  }

  function create() {
    const name = draft.trim()
    const parent = creating?.parent ?? null
    setCreating(null)
    setDraft('')
    if (name) onCreate?.(name, parent)
  }

  // --- Le fond : un millimétré à deux pas, qui suit la caméra -----------------
  const grid = (c: string) =>
    `linear-gradient(${c} 1px, transparent 1px),linear-gradient(90deg, ${c} 1px, transparent 1px)`
  const f1 = 12 * view.z
  const f2 = 60 * view.z
  const origin = `calc(50% + ${view.px}px) calc(50% + ${view.py}px)`
  const background: CSSProperties = {
    backgroundImage: `${grid('color-mix(in oklab, var(--color-border) 55%, transparent)')},${grid('color-mix(in oklab, var(--color-border) 22%, transparent)')}`,
    backgroundSize: `${f2}px ${f2}px,${f2}px ${f2}px,${f1}px ${f1}px,${f1}px ${f1}px`,
    backgroundPosition: Array(4).fill(origin).join(','),
  }

  return (
    <div
      className={cn(
        'overflow-hidden border bg-card',
        full
          ? 'fixed inset-0 z-40 rounded-none border-0'
          : picker
            ? 'h-full rounded-xl shadow-xs'
            : mode === 'read'
              ? 'rounded-xl shadow-xs'
              : 'rounded-t-xl border-b-0',
      )}
    >
      <div
        ref={box}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-node]')) return
          pan.current = { x: e.clientX, y: e.clientY, px: view.px, py: view.py }
        }}
        className="relative cursor-grab overflow-hidden select-none active:cursor-grabbing"
        style={{
          height,
          transition: 'height .35s ease',
          boxShadow: attach ? `inset 0 0 0 2px ${color.ink}` : undefined,
          ...background,
        }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: base.width,
            height: base.height,
            transform: `translate(calc(-50% + ${view.px}px), calc(-50% + ${view.py}px)) scale(${scale})`,
            transition: fondu ? 'transform .35s ease' : undefined,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${shown.dx}px, ${shown.dy}px)`,
              transition: fondu ? 'transform .35s ease' : undefined,
            }}
          >
            <svg
              className="absolute inset-0 overflow-visible"
              width={layout.width}
              height={layout.height}
            >
              {layout.paths.map((p) => {
                const ghost = p.to.startsWith(PLUS) || p.to.startsWith(CREATE)
                const place = p.to.startsWith(PLACE)
                // Les branches racines, parties du moyeu, restent à l'encre.
                const out =
                  attach &&
                  p.from !== null &&
                  !ghost &&
                  !place &&
                  !inScope(p.to)
                const muted = ghost || out
                const d = p.d
                const foldable = !attach && p.from !== null && !glisse
                const faded =
                  glisse && (p.to === glisse.id || p.from === glisse.id)
                return (
                  <g key={p.to}>
                    <path
                      d={d}
                      fill="none"
                      stroke={muted ? 'var(--color-border)' : color.ink}
                      strokeWidth={muted ? 1 : 1.5}
                      strokeDasharray={muted || place ? '3 3' : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={faded ? 0.25 : place ? 0.7 : 1}
                      // La propriété CSS `d` doublée de l'attribut : c'est elle
                      // qui s'anime quand une branche change de tracé.
                      style={{ d: `path("${d}")`, transition: 'd .18s ease' }}
                    />
                    {foldable && (
                      // La branche se clique : elle replie son parent.
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={10}
                        className="cursor-pointer"
                        style={{ pointerEvents: 'stroke' }}
                        data-node
                        onClick={() => toggleFold(p.from!)}
                      />
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Le moyeu : le disque du domaine. */}
            <div
              className="absolute flex h-[34px] items-center justify-center"
              style={{
                left: layout.domain.left,
                top: layout.domain.top,
                width: 56,
              }}
            >
              <span
                data-node
                data-hub
                className="relative grid size-[52px] shrink-0 place-items-center rounded-full bg-card text-2xl leading-none transition-shadow"
                style={{
                  border: `1.5px solid ${color.ink}`,
                  cursor: attach ? undefined : 'pointer',
                  boxShadow:
                    target?.id === HUB
                      ? `0 0 0 2px var(--color-card), 0 0 0 4px ${color.ink}`
                      : '0 2px 8px 0 oklch(0.21 0.008 285 / 0.12)',
                }}
                title={attach ? undefined : 'Tout replier / déplier'}
                onMouseEnter={() => setHoverHub(true)}
                onMouseLeave={() => setHoverHub(false)}
                onClick={attach ? undefined : toggleAll}
              >
                {domainEmoji}
                {attach && hoverHub && !creating && (
                  <>
                    {(['left', 'right'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        title={`Nouveau savoir ${side === 'left' ? 'à gauche' : 'à droite'}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setCreating({ parent: null })
                        }}
                        className="absolute top-1/2 z-[3] grid h-5 w-[25px] -translate-y-1/2 place-items-center rounded border border-dashed bg-card text-muted-foreground"
                        style={
                          side === 'left' ? { left: -12.5 } : { right: -12.5 }
                        }
                      >
                        <Plus className="size-2.5" strokeWidth={3} />
                      </button>
                    ))}
                  </>
                )}
              </span>
            </div>

            {layout.nodes.map((n) => (
              <Node
                key={n.id}
                n={n}
                color={color}
                attach={attach}
                level={levels.get(n.id)}
                selected={openSkillId === n.id}
                dragging={glisse?.id === n.id}
                dropIn={target?.id === n.id && target.zone === 'in'}
                onGrab={(e) => grab(e, n)}
                hoverChevron={hoverChevron === n.id}
                hoverLink={hoverLink === n.id}
                parentName={ghostParentName(n.id)}
                draft={draft}
                onDraft={setDraft}
                onCreate={create}
                onCancelCreate={() => {
                  setCreating(null)
                  setDraft('')
                }}
                onClick={() => {
                  if (n.id.startsWith(PLUS)) {
                    setCreating({ parent: n.id.slice(PLUS.length) })
                    return
                  }
                  if (attach) {
                    if (!inScope(n.id)) onAttach?.(n.id)
                    return
                  }
                  if (inScope(n.id)) onOpenSkill?.(n.id)
                }}
                onAddChild={
                  attach && !ghostId(n.id) && n.kidIds.length === 0 && !creating
                    ? () => setCreating({ parent: n.id })
                    : undefined
                }
                onToggleFold={() => toggleFold(n.id)}
                onChevronHover={(on) => setHoverChevron(on ? n.id : null)}
                onLinkHover={(on) => setHoverLink(on ? n.id : null)}
                onLink={() =>
                  inScope(n.id) ? setDetaching(n.id) : onAttach?.(n.id)
                }
              />
            ))}
            {glisse && target?.zone === 'in' && target.id !== HUB && (
              <InsidePreview
                layout={layout}
                targetId={target.id}
                name={glisse.name}
                width={Math.max(60, (drag.current?.w ?? 80) / scale)}
                color={color}
              />
            )}
          </div>
        </div>
        {glisse && drag.current && box.current && (
          <GhostLabel
            name={glisse.name}
            left={
              glisse.cx -
              drag.current.offX -
              box.current.getBoundingClientRect().left
            }
            top={
              glisse.cy -
              drag.current.offY -
              box.current.getBoundingClientRect().top
            }
            height={drag.current.h}
            scale={scale}
            ink={color.ink}
          />
        )}

        {/* En bas à gauche : l'outil de rattachement, puis recentrer. */}
        <div
          data-node
          className="absolute bottom-2.5 left-2.5 z-10 flex flex-col overflow-hidden rounded-md border bg-card shadow-xs empty:hidden"
        >
          {edit && !picker && (
            <button
              type="button"
              aria-label="Rattacher des savoirs"
              title="Rattacher des savoirs"
              aria-pressed={attach}
              onClick={() => {
                setAttach((a) => !a)
                setCreating(null)
              }}
              className={cn(
                'grid size-7 place-items-center border-b',
                attach
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {/* Un rond, une fourche, un « + » : le pictogramme de la maquette. */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="12" r="2.5" />
                <path d="M8.5 12H13M13 12c2 0 2-5 5-5M13 12c2 0 2 5 5 5" />
                <path d="M18 3v4M16 5h4" />
              </svg>
            </button>
          )}
          {(view.z !== 1 || view.px !== 0 || view.py !== 0) && (
            <button
              type="button"
              aria-label="Recentrer"
              title="Recentrer"
              onClick={() => setView({ z: 1, px: 0, py: 0 })}
              className="grid size-7 place-items-center border-b bg-card text-muted-foreground hover:bg-muted"
            >
              <LocateFixed className="size-3.5" />
            </button>
          )}
          {!picker && (
            <button
              type="button"
              aria-label={full ? 'Quitter le plein écran' : 'Plein écran'}
              title={full ? 'Quitter le plein écran' : 'Plein écran'}
              onClick={() => setFull((f) => !f)}
              className="grid size-7 place-items-center bg-card text-muted-foreground hover:bg-muted"
            >
              {full ? (
                <Minimize2 className="size-3.5" />
              ) : (
                /* Quatre coins : le pictogramme de la maquette. */
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      {detaching && renderDetach?.(detaching, () => setDetaching(null))}
    </div>
  )
}

function Node({
  n,
  color,
  attach,
  level,
  selected,
  dragging,
  dropIn,
  onGrab,
  hoverChevron,
  hoverLink,
  parentName,
  draft,
  onDraft,
  onCreate,
  onCancelCreate,
  onClick,
  onAddChild,
  onToggleFold,
  onChevronHover,
  onLinkHover,
  onLink,
}: {
  n: MapNode
  color: DomainColorValues
  attach: boolean
  level: number | undefined
  selected: boolean
  dragging: boolean
  dropIn: boolean
  onGrab: (e: React.MouseEvent) => void
  hoverChevron: boolean
  hoverLink: boolean
  /** Le parent d'un nœud fantôme (« + », champ de création). */
  parentName: string | undefined
  draft: string
  onDraft: (v: string) => void
  onCreate: () => void
  onCancelCreate: () => void
  onClick: () => void
  /** Une feuille, en mode rattachement : son premier enfant se crée depuis
   *  le « + » qui paraît au survol (un parent a le sien, en fin de fratrie). */
  onAddChild?: () => void
  onToggleFold: () => void
  onChevronHover: (on: boolean) => void
  onLinkHover: (on: boolean) => void
  onLink: () => void
}) {
  const base: CSSProperties = {
    left: n.left,
    top: n.top,
    width: n.w,
    flexDirection: n.dir === 1 ? 'row' : 'row-reverse',
  }
  const cls =
    'absolute flex h-5 items-center gap-1.5 rounded border border-transparent px-1.5 text-[13px] leading-[18px] font-medium whitespace-nowrap [transition:color_.25s_ease,left_.18s_ease,top_.18s_ease]'

  // La place réservée pendant un glisser.
  if (n.id.startsWith(PLACE))
    return (
      <div
        className={cn(cls, 'pointer-events-none border-dashed opacity-90')}
        style={{
          ...base,
          borderColor: color.ink,
          background: color.soft,
          color: color.fonce,
        }}
      >
        <span className="block leading-none whitespace-nowrap">{n.name}</span>
      </div>
    )
  // Le « + » d'un parent, en mode rattachement.
  if (n.id.startsWith(PLUS))
    return (
      <div
        data-node
        title={parentName ? `Ajouter dans « ${parentName} »` : undefined}
        onClick={onClick}
        className={cn(
          cls,
          'cursor-pointer justify-center border-dashed border-border text-muted-foreground',
        )}
        style={base}
      >
        <Plus className="size-3" />
      </div>
    )
  // Le champ de création, en place.
  if (n.id.startsWith(CREATE))
    return (
      <div
        data-node
        title={`Créer un savoir dans ${parentName ? `« ${parentName} »` : 'le domaine'}`}
        className={cn(cls, 'z-[15] bg-card')}
        style={{
          ...base,
          width: Math.max(n.w, 150),
          left: n.dir === 1 ? n.left : n.left + n.w - Math.max(n.w, 150),
          borderColor: color.ink,
        }}
      >
        <Plus className="size-3 shrink-0" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCreate()
            if (e.key === 'Escape') onCancelCreate()
          }}
          onBlur={onCreate}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full min-w-0 bg-transparent p-0 text-[13px] outline-none"
        />
      </div>
    )

  const parent = n.kidIds.length > 0 || n.collapsed
  const inScope = level !== undefined
  const p = ((level ?? 0) / 4) * 100
  const title = attach
    ? inScope
      ? undefined
      : 'Rattacher au projet'
    : !inScope
      ? undefined
      : level! >= 4
        ? 'Acquis'
        : level! > 0
          ? `${PHASES[level! - 1]} en cours`
          : 'Pas commencé'
  const linked = inScope !== hoverLink

  return (
    <div
      data-node
      title={title}
      onMouseDown={onGrab}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        cls,
        'group/node cursor-pointer',
        dragging && 'pointer-events-none opacity-30',
      )}
      style={{
        ...base,
        ...(dropIn
          ? {
              borderRadius: 6,
              boxShadow: `0 0 0 2px var(--color-card), 0 0 0 4px ${color.ink}`,
            }
          : null),
        color: selected ? color.ink : attach && !inScope ? GRIS : undefined,
      }}
    >
      {attach ? (
        <button
          type="button"
          title={inScope ? 'Détacher du projet' : 'Rattacher au projet'}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => onLinkHover(true)}
          onMouseLeave={() => onLinkHover(false)}
          onClick={(e) => {
            e.stopPropagation()
            onLink()
          }}
          className="grid size-5 shrink-0 place-items-center rounded"
          style={{ color: linked ? color.ink : GRIS }}
        >
          {linked ? (
            <Link className="size-[18px]" strokeWidth={1.9} />
          ) : (
            <Unlink className="size-[18px]" strokeWidth={1.9} />
          )}
        </button>
      ) : (
        inScope && (
          <span
            className="grid size-[15px] shrink-0 place-items-center rounded-full text-white"
            style={
              p >= 100
                ? { border: `1.5px solid ${color.ink}`, background: color.ink }
                : {
                    border: `1.5px solid ${p ? color.ink : 'var(--color-border)'}`,
                    background: `conic-gradient(${color.ink} ${p}%, var(--color-card) 0)`,
                    boxShadow: 'inset 0 0 0 1.5px var(--color-card)',
                  }
            }
          >
            {p >= 100 && <Check className="size-[9px]" strokeWidth={3.5} />}
          </span>
        )
      )}
      <span className="block leading-none whitespace-nowrap [text-box:trim-both_cap_alphabetic]">
        {n.name}
      </span>
      {n.collapsed && !attach && (
        <span
          className="grid h-[15px] min-w-[15px] shrink-0 place-items-center rounded-full px-1 text-[9px] leading-none font-semibold text-white"
          style={{ background: color.ink }}
        >
          {n.count}
        </span>
      )}
      {onAddChild && (
        // Collé au bout du nœud (la marge est dans le bouton) : le survol ne
        // se perd pas en allant de l'un à l'autre.
        <button
          type="button"
          title={`Ajouter dans « ${n.name} »`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAddChild()
          }}
          className={cn(
            'absolute top-1/2 grid -translate-y-1/2 opacity-0 transition-opacity group-hover/node:opacity-100',
            n.dir === 1 ? 'left-full pl-1.5' : 'right-full pr-1.5',
          )}
        >
          <span className="grid h-4 w-[22px] place-items-center rounded border border-dashed bg-card text-muted-foreground hover:text-foreground">
            <Plus className="size-2.5" strokeWidth={3} />
          </span>
        </button>
      )}
      {parent && !attach && (
        <button
          type="button"
          title={n.collapsed ? 'Déplier' : 'Replier'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFold()
          }}
          onMouseEnter={() => onChevronHover(true)}
          onMouseLeave={() => onChevronHover(false)}
          className="order-9 -mx-0.5 grid size-4 shrink-0 place-items-center self-center rounded transition-colors"
          style={
            hoverChevron
              ? { background: color.soft, color: color.ink }
              : { color: GRIS }
          }
        >
          <ChevronRight
            className="size-[13px]"
            strokeWidth={2.6}
            style={{
              transform: `rotate(${n.collapsed ? (n.dir === 1 ? 0 : 180) : 90}deg)`,
              transition: 'transform .15s',
            }}
          />
        </button>
      )}
    </div>
  )
}

/** Où le savoir tombera s'il est lâché dessus : une branche pointillée
 *  jusqu'à une place au bout de la fratrie. Rien d'autre ne bouge. */
function InsidePreview({
  layout,
  targetId,
  name,
  width,
  color,
}: {
  layout: ReturnType<typeof buildMap>
  targetId: string
  name: string
  width: number
  color: DomainColorValues
}) {
  const N = layout.nodes.find((n) => n.id === targetId)
  if (!N) return null
  const H = 10
  const step = 37
  const dir = N.dir
  const kids = N.kidIds
    .map((id) => layout.nodes.find((n) => n.id === id))
    .filter((k): k is MapNode => Boolean(k) && !k!.id.startsWith(PLUS))
  const last = kids[kids.length - 1]
  const x0 = last
    ? dir === 1
      ? last.left
      : last.left + last.w
    : dir === 1
      ? N.left + N.w + 40
      : N.left - 40
  const y = last ? last.top + H + step / 2 + 4 : N.top + H
  const x1 = dir === 1 ? N.left + N.w : N.left
  const dx = (x0 - x1) / 2
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={layout.width}
        height={layout.height}
      >
        <path
          d={`M ${x1} ${N.top + H} C ${x1 + dx} ${N.top + H}, ${x0 - dx} ${y}, ${x0} ${y}`}
          fill="none"
          stroke={color.ink}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.7}
        />
      </svg>
      <span
        className="pointer-events-none absolute z-[5] flex h-5 items-center overflow-hidden rounded border border-dashed px-1.5 text-[13px] font-medium whitespace-nowrap"
        style={{
          left: dir === 1 ? x0 : x0 - width,
          top: y - 10,
          width,
          borderColor: color.ink,
          background: color.soft,
          color: color.fonce,
        }}
      >
        {name}
      </span>
    </>
  )
}

/** L'étiquette qui suit le pointeur pendant un glisser. */
function GhostLabel({
  name,
  left,
  top,
  height,
  scale,
  ink,
}: {
  name: string
  left: number
  top: number
  height: number
  scale: number
  ink: string
}) {
  return (
    <div
      className="pointer-events-none absolute z-50 flex items-center rounded bg-card font-medium whitespace-nowrap"
      style={{
        boxShadow:
          '0 6px 16px -4px oklch(0.21 0.008 285 / 0.25), 0 0 0 1px oklch(0.21 0.008 285 / 0.06)',
        left,
        top,
        height,
        fontSize: 13 * scale,
        padding: `0 ${6 * scale}px`,
        color: ink,
        transform: 'rotate(-1.5deg)',
      }}
    >
      {name}
    </div>
  )
}
