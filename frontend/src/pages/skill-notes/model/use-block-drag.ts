import type { Editor } from '@tiptap/core'
import { type RefObject, useCallback, useEffect, useRef } from 'react'

import {
  type Drop,
  type Dragged,
  moveResult,
  moveTransaction,
} from '../lib/block-move'
import {
  type BlockHit,
  blockBox,
  type BoxAt,
  dropTarget,
} from '../lib/drop-target'
import { edgeScroll, scrollerOf } from '../lib/edge-scroll'

/** L'image du glisser du navigateur : rien — le fantôme est le nôtre. */
const BLANK = (() => {
  if (typeof Image === 'undefined') return null
  const img = new Image()
  img.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  return img
})()

/**
 * Le glisser d'un bloc par sa poignée ⋮⋮, à la Notion : un **fantôme** — le
 * bloc cloné en pleine taille, à 40 % — suit le pointeur, le bloc d'origine
 * reste tel quel ; un **trait d'arrivée** de 4 px (`dropTarget`) marque où il
 * ira — dans sa colonne, dans ou hors d'un conteneur, ailleurs dans la page,
 * ou à côté d'un bloc (une colonne s'ouvre) ; près du haut ou du bas de
 * l'écran, la page **défile**. Le lâcher le déplace. Un titre se déplace
 * seul, comme tout bloc.
 *
 * Le glisser est celui du navigateur (son image est vide), mais le dépôt est
 * le nôtre : tant qu'il dure, `dragover` et `drop` sont pris avant
 * l'éditeur, qui n'insère rien de lui-même. Hors de la feuille, ou sur une
 * place qui ne change rien, le trait s'efface et rien ne bouge. Le
 * déplacement est une seule transaction (`moveTransaction`), que la garde des
 * questions laisse passer ; l'autosave enregistre ensuite le document.
 *
 * Fantôme et trait sont des éléments posés à la main (pas de rendu React à
 * chaque `dragover`) : le fantôme dans un calque fixe, le trait dans `area`.
 */
export function useBlockDrag(
  editor: Editor,
  area: RefObject<HTMLElement | null>,
  onEnd: () => void,
) {
  const dragging = useRef<Dragged | null>(null)
  const target = useRef<Drop | null>(null)
  const endRef = useRef(onEnd)
  endRef.current = onEnd
  // Ce que le glisser a posé dans la page, et où est le pointeur.
  const scene = useRef<{
    layer: HTMLElement
    ghost: HTMLElement
    grab: { x: number; y: number }
    line: HTMLElement
    pointer: { x: number; y: number } | null
    frame: number
  } | null>(null)
  // La visée, pour le défilement automatique (cf. l'effet ci-dessous).
  const aimRef = useRef<((x: number, y: number) => void) | null>(null)

  const boxAt = useCallback<BoxAt>(
    (pos) => {
      const dom = editor.view.nodeDOM(pos)
      return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
    },
    [editor],
  )

  const finish = useCallback(() => {
    if (!dragging.current) return
    dragging.current = null
    target.current = null
    const s = scene.current
    scene.current = null
    if (s) {
      cancelAnimationFrame(s.frame)
      s.layer.remove()
      s.line.remove()
    }
    endRef.current()
  }, [])

  useEffect(() => {
    // Le dernier repère calculé : `dragover` se répète sans cesse.
    let last: { side: string; ref: unknown; ok: boolean } | null = null

    const inside = (e: DragEvent) =>
      e.target instanceof Node && !!area.current?.contains(e.target)

    const hide = () => {
      target.current = null
      if (scene.current) scene.current.line.style.opacity = '0'
    }

    /** La place visée, le pointeur en (`x`, `y`) : le trait s'y pose. */
    const aim = (x: number, y: number) => {
      const d = dragging.current
      const s = scene.current
      const root = area.current
      if (!d || !s || !root) return
      const { doc } = editor.state
      const found = dropTarget(doc, boxAt, x, y)
      let ok = false
      if (found) {
        const { side, ref } = found.drop
        ok =
          last?.side === side && last.ref === ref
            ? last.ok
            : moveResult(doc, d, found.drop) !== null
        last = { side, ref, ok }
      }
      if (!found || !ok) return hide()
      target.current = found.drop
      const at = root.getBoundingClientRect()
      const m = found.mark
      Object.assign(s.line.style, {
        left: `${m.left - at.left}px`,
        top: `${m.top - at.top}px`,
        width: `${m.width}px`,
        height: `${m.height}px`,
        opacity: '1',
      })
    }

    const over = (e: DragEvent) => {
      if (!dragging.current) return
      // Pris avant l'éditeur : il ne montre ni ne dépose rien de lui-même.
      e.stopPropagation()
      const s = scene.current
      if (s && (e.clientX || e.clientY)) {
        s.pointer = { x: e.clientX, y: e.clientY }
        s.ghost.style.transform = `translate(${e.clientX - s.grab.x}px, ${e.clientY - s.grab.y}px)`
      }
      if (!area.current || !inside(e)) return hide()
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      if (e.type === 'dragover') aim(e.clientX, e.clientY)
    }

    const drop = (e: DragEvent) => {
      const d = dragging.current
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      const t = target.current
      if (t && inside(e)) {
        const tr = moveTransaction(editor.state, d, t)
        if (tr) editor.view.dispatch(tr)
      }
      last = null
      finish()
    }

    const end = () => {
      last = null
      finish()
    }

    // En capture, sur le document : avant l'éditeur et ses vues.
    document.addEventListener('dragenter', over, true)
    document.addEventListener('dragover', over, true)
    document.addEventListener('drop', drop, true)
    document.addEventListener('dragend', end, true)
    // Un glisser dont la fin ne nous est pas parvenue : le premier
    // mouvement de souris après lui le termine.
    document.addEventListener('mousemove', end, true)
    aimRef.current = aim
    return () => {
      document.removeEventListener('dragenter', over, true)
      document.removeEventListener('dragover', over, true)
      document.removeEventListener('drop', drop, true)
      document.removeEventListener('dragend', end, true)
      document.removeEventListener('mousemove', end, true)
      aimRef.current = null
    }
  }, [editor, area, boxAt, finish])

  /** À brancher sur le `dragstart` de la poignée du bloc `hit`. */
  const start = useCallback(
    (e: React.DragEvent, hit: BlockHit) => {
      const root = area.current
      const dom = editor.view.nodeDOM(hit.pos)
      if (!root || !(dom instanceof HTMLElement)) return
      dragging.current = { node: hit.node, list: hit.list }
      target.current = null

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', hit.node.textContent)
      if (BLANK) e.dataTransfer.setDragImage(BLANK, 0, 0)

      // Un élément de liste : sa puce comprise.
      const box = blockBox({ box: dom.getBoundingClientRect(), list: hit.list })
      const layer = document.createElement('div')
      layer.setAttribute('aria-hidden', 'true')
      layer.style.cssText =
        'position:fixed;inset:0;z-index:999;pointer-events:none;overflow:hidden'
      const ghost = document.createElement('div')
      // La typographie des notes : les classes de l'éditeur, sans son retrait.
      ghost.className = editor.view.dom.className
      ghost.style.cssText = `position:absolute;left:0;top:0;padding:0;margin:0;width:${box.right - box.left}px;opacity:0.4;will-change:transform;transform:translate(${box.left}px, ${box.top}px)`
      ghost.append(cloneBlock(dom, hit.list && listDom(dom)))
      layer.append(ghost)
      document.body.append(layer)

      const line = document.createElement('span')
      line.setAttribute('aria-hidden', 'true')
      line.className =
        'pointer-events-none absolute z-20 bg-(--note-accent)/43 opacity-0 transition-opacity duration-200'
      root.append(line)

      const s = {
        layer,
        ghost,
        grab: { x: e.clientX - box.left, y: e.clientY - box.top },
        line,
        pointer: null as { x: number; y: number } | null,
        frame: 0,
      }
      scene.current = s

      // Le défilement au bord de l'écran (ou de ce qui défile), tant que
      // le glisser dure : d'autant plus vite qu'on est près du bord.
      const scroller = scrollerOf(root)
      const tick = () => {
        if (scene.current !== s) return
        const p = s.pointer
        // La page a bougé sous le pointeur : le trait suit.
        if (p && edgeScroll(scroller, p.y)) aimRef.current?.(p.x, p.y)
        s.frame = requestAnimationFrame(tick)
      }
      s.frame = requestAnimationFrame(tick)
    },
    [editor, area],
  )

  return { start, end: finish }
}

/** La liste (`ul`, `ol`) d'un élément affiché. */
function listDom(dom: HTMLElement): HTMLElement | null {
  const list = dom.parentElement
  return list && /^(UL|OL)$/.test(list.tagName) ? list : null
}

/**
 * Le bloc cloné pour le fantôme. Les champs gardent leur valeur (un clone
 * ne la copie pas), la vue ne capte rien. Un élément de liste est cloné dans
 * une copie vide de sa liste (`list`) : sa puce, son numéro restent.
 */
function cloneBlock(dom: HTMLElement, list?: HTMLElement | null): HTMLElement {
  const clone = dom.cloneNode(true) as HTMLElement
  copyFields(dom, clone)
  clone.removeAttribute('id')
  clone.setAttribute('contenteditable', 'false')
  if (!list) return clone
  const wrap = list.cloneNode(false) as HTMLElement
  // Le numéro de l'élément, pas « 1. ».
  const index = Array.prototype.indexOf.call(list.children, dom)
  if (wrap.tagName === 'OL') wrap.setAttribute('start', String(index + 1))
  wrap.style.paddingTop = '0'
  wrap.append(clone)
  return wrap
}

/** Les champs du clone reprennent la valeur des originaux. */
function copyFields(dom: HTMLElement, clone: HTMLElement) {
  const from = dom.querySelectorAll('input, textarea, select')
  const to = clone.querySelectorAll('input, textarea, select')
  from.forEach((field, i) => {
    const copy = to[i]
    if (copy && 'value' in copy && 'value' in field)
      (copy as HTMLInputElement).value = (field as HTMLInputElement).value
  })
}
