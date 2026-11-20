import type { Editor } from '@tiptap/core'
import { type RefObject, useEffect, useState } from 'react'

import {
  blockSelOf,
  type BlockSel,
  clearBlockSel,
  selectBlocks,
} from '../lib/block-selection'
import { sameFlow } from '../lib/block-unit'
import type { Box, BoxAt } from '../lib/drop-target'
import { edgeScroll, scrollerOf } from '../lib/edge-scroll'
import { type MarqueeRange, marqueeRange } from '../lib/marquee'

/** Le rectangle à l'écran, dans le repère de `area`. */
export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

/** Le déplacement au-delà duquel un appui devient un rectangle (px). */
const THRESHOLD = 3

/**
 * Ce qui, hors de l'éditeur, garde son propre clic : un contrôle, la
 * poignée, le sommaire, un menu ouvert…
 */
const OWN_CLICK = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  'nav',
  '[role]',
  '[contenteditable]',
  '[data-block-handle]',
  '[data-radix-popper-content-wrapper]',
].join(', ')

/**
 * Le rectangle de sélection, à la Notion : un appui dans le vide autour des
 * notes (les marges, sous le texte, au-dessus du premier bloc — partout dans
 * la page hors de l'éditeur et de ses contrôles), puis un glisser, trace un
 * rectangle ; les blocs qu'il touche sont sélectionnés en direct
 * (`marqueeRange`) — la sélection de blocs ordinaire, avec son halo et ses
 * raccourcis (⌘D, Suppr, ⌘⇧↑/↓, menu de bloc). Près du haut ou du bas de
 * l'écran, la page défile et le rectangle la suit.
 *
 * ⇧ à l'appui étend la sélection en place (d'un seul tenant : ce qui sépare
 * les deux en fait partie). Un simple clic dans le vide la défait. Au lâcher,
 * l'éditeur prend le focus : les raccourcis répondent.
 *
 * Renvoie le rectangle à dessiner, ou nul.
 */
export function useMarquee(
  editor: Editor,
  area: RefObject<HTMLElement | null>,
): MarqueeRect | null {
  const [rect, setRect] = useState<MarqueeRect | null>(null)

  useEffect(() => {
    const view = editor.view
    const boxAt: BoxAt = (pos) => {
      const dom = view.nodeDOM(pos)
      return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
    }

    // Le geste en cours : son départ (dans le repère de `area`, qui défile
    // avec la page), le pointeur, la sélection d'avant (⇧), ce qui est posé.
    let g: {
      root: HTMLElement
      start: { x: number; y: number }
      pointer: { x: number; y: number }
      base: BlockSel | null
      started: boolean
      applied: string
      scroller: HTMLElement | null
      frame: number
    } | null = null

    /** ⇧ : la sélection d'avant et le rectangle, d'un seul tenant. */
    const merge = (r: MarqueeRange, base: BlockSel | null): MarqueeRange => {
      if (!base) return r
      if (!sameFlow(editor.state.doc, base.anchor, r.anchor)) return r
      const all = [base.anchor, base.head, r.anchor, r.head]
      const lo = Math.min(...all)
      const hi = Math.max(...all)
      // L'ancre reste du côté de la sélection d'avant.
      return r.head < base.anchor
        ? { anchor: hi, head: lo }
        : { anchor: lo, head: hi }
    }

    const update = () => {
      if (!g?.started) return
      const at = g.root.getBoundingClientRect()
      const sx = g.start.x + at.left
      const sy = g.start.y + at.top
      const { x, y } = g.pointer
      const box: Box = {
        left: Math.min(sx, x),
        right: Math.max(sx, x),
        top: Math.min(sy, y),
        bottom: Math.max(sy, y),
      }
      setRect({
        left: box.left - at.left,
        top: box.top - at.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      })
      const found = marqueeRange(editor.state.doc, boxAt, box, y < sy)
      const range = found ? merge(found, g.base) : g.base
      const key = range ? `${range.anchor}:${range.head}` : ''
      if (key === g.applied) return
      g.applied = key
      if (range) selectBlocks(view, range.anchor, { head: range.head })
      else clearBlockSel(view)
    }

    const down = (e: MouseEvent) => {
      const root = area.current
      if (e.button !== 0 || e.defaultPrevented || !root) return
      if (!editor.isEditable) return
      const target = e.target
      if (!(target instanceof Element)) return
      const zone = root.closest('main') ?? root.parentElement
      if (!zone?.contains(target) || view.dom.contains(target)) return
      if (target.closest(OWN_CLICK)) return
      // Ni sélection de texte du navigateur, ni perte du focus.
      e.preventDefault()
      const base = e.shiftKey ? blockSelOf(view.state) : null
      if (!base) clearBlockSel(view)
      const at = root.getBoundingClientRect()
      g = {
        root,
        start: { x: e.clientX - at.left, y: e.clientY - at.top },
        pointer: { x: e.clientX, y: e.clientY },
        base,
        started: false,
        applied: base ? `${base.anchor}:${base.head}` : '',
        scroller: scrollerOf(root),
        frame: 0,
      }
    }

    const move = (e: MouseEvent) => {
      if (!g) return
      g.pointer = { x: e.clientX, y: e.clientY }
      if (!g.started) {
        const at = g.root.getBoundingClientRect()
        const dx = e.clientX - (g.start.x + at.left)
        const dy = e.clientY - (g.start.y + at.top)
        if (Math.hypot(dx, dy) < THRESHOLD) return
        g.started = true
        // Le défilement au bord de l'écran, tant que le geste dure.
        const gesture = g
        const tick = () => {
          if (g !== gesture) return
          if (edgeScroll(gesture.scroller, gesture.pointer.y)) update()
          gesture.frame = requestAnimationFrame(tick)
        }
        g.frame = requestAnimationFrame(tick)
      }
      update()
    }

    const up = () => {
      if (!g) return
      cancelAnimationFrame(g.frame)
      const started = g.started
      g = null
      setRect(null)
      // Les raccourcis de la sélection de blocs passent par l'éditeur.
      if (started && blockSelOf(view.state)) view.focus()
    }

    // La page défile sous un rectangle immobile (molette) : il suit.
    const scrolled = () => update()

    document.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('blur', up)
    window.addEventListener('scroll', scrolled, true)
    return () => {
      if (g) cancelAnimationFrame(g.frame)
      g = null
      document.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('blur', up)
      window.removeEventListener('scroll', scrolled, true)
    }
  }, [editor, area])

  return rect
}
