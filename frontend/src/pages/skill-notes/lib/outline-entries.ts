import type { JSONContent } from '@tiptap/core'

import { HEADING } from './blocks'
import { questionSections } from './question-sections'

/** Un titre du sommaire de la colonne. */
export interface OutlineEntry {
  key: string
  title: string
  /** 1 à 3 : le retrait dans la colonne. */
  level: number
  /** Les questions rangées sous ce titre, et pas sous un titre plus petit. */
  count: number
  /**
   * Son rang parmi les titres **de premier rang** du document (vides
   * compris) : c'est ainsi qu'on le retrouve dans l'éditeur
   * (`.ProseMirror > h1, h2, h3`).
   */
  ordinal: number
}

/**
 * Le sommaire de la colonne des notes (#173, `prod/Notes`) : un titre par
 * entrée, avec **le nombre de questions qu'il range** — le même découpage
 * que « Préparer les questions » (`questionSections`), pour que les deux
 * vues comptent pareil : une question compte pour le **plus petit titre qui
 * la contient** ; le texte direct sous un titre de section (ou repris après
 * un titre vide) compte pour la section. Le texte d'avant tout titre n'a pas
 * d'entrée.
 *
 * Seuls les titres de premier rang découpent, comme le serveur
 * (`domain/notes.py`) : un titre logé dans des colonnes, un menu dépliant ou
 * un encadré n'a pas d'entrée.
 *
 * Lu sur le document du serveur (`toEditorDoc(notes)`), pas sur l'éditeur :
 * le sommaire reste là quand une autre vue (une ressource, « Préparer les
 * questions ») prend la place des notes. Le cache des notes suit chaque
 * enregistrement, à 0,7 s de la frappe.
 */
export function outlineEntries(doc: JSONContent): OutlineEntry[] {
  // Le rang de chaque titre de premier rang, par index dans le document.
  const ordinals = new Map<string, number>()
  let n = 0
  ;(doc.content ?? []).forEach((node, i) => {
    if (node.type === HEADING) ordinals.set(String(i), n++)
  })

  return questionSections(doc).flatMap((section) => {
    const entries: OutlineEntry[] = []
    if (section.title) {
      const own = section.parts
        .filter((p) => !p.title)
        .reduce((sum, p) => sum + p.questions.length, 0)
      entries.push({
        key: section.key,
        title: section.title.text,
        level: section.title.level,
        count: own,
        ordinal: ordinals.get(section.key) ?? -1,
      })
    }
    section.parts.forEach((p) => {
      if (!p.title) return
      entries.push({
        key: p.key,
        title: p.title.text,
        level: p.title.level,
        count: p.questions.length,
        ordinal: ordinals.get(p.key) ?? -1,
      })
    })
    return entries.filter((e) => e.ordinal >= 0)
  })
}
