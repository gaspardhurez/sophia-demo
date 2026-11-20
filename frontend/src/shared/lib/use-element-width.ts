import { useCallback, useRef, useState } from 'react'

/**
 * La largeur rendue d'un élément, suivie au redimensionnement.
 *
 * Elle existe pour les dessins **en pixels réels**. Un SVG à `viewBox` fixe posé
 * dans un conteneur fluide est mis à l'échelle en bloc : le texte suit, et une
 * étiquette de 11px tombe à 5px dans une demi-colonne — illisible sans qu'aucune
 * valeur du code ne l'annonce. En mesurant, une unité SVG vaut un pixel : ce
 * qu'on écrit est ce qu'on voit.
 *
 * Rend une **ref de rappel** plutôt qu'une `RefObject` : l'observation démarre à
 * l'attachement du nœud, sans effet qui coure après le premier rendu.
 */
export function useElementWidth<T extends Element>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    if (!node) return
    setWidth(node.getBoundingClientRect().width)
    observer.current = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.current.observe(node)
  }, [])

  return [ref, width]
}
