import type { JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

import { HEADING, PARAGRAPH } from './blocks'
import { QUESTION_REF, QUESTIONS } from './question-anchors'
import { QUESTION } from './question-node'

/**
 * Le découpage des notes pour « Préparer les questions » (#173, `prod/Notes`,
 * idéation `Preparer les questions` 4) : par section, les notes en face de
 * leurs questions.
 *
 * Le document ne range rien en sections (ses titres ne sont que de la mise en
 * forme) : le découpage se lit à la volée, sur les **titres de premier rang**
 * du document — comme le serveur lit la place d'une question
 * (`domain/notes.py`, `question_places`) : un titre de niveau *n* ferme les
 * titres de niveau ≥ *n* ouverts au-dessus de lui ; un titre vide les ferme
 * sans en ouvrir. Un titre logé dans des colonnes, un menu dépliant ou un
 * encadré compte comme du texte.
 *
 * - Une **section** s'ouvre sur un titre qui n'a aucun titre ouvert au-dessus
 *   de lui (un H1, ou un H2 qui précède tout H1…) ; le texte d'avant tout
 *   titre forme une section sans titre.
 * - Une section se découpe en **parties** : une par titre rencontré, le texte
 *   qui le suit jusqu'au titre suivant. Une question se range ainsi au **plus
 *   petit niveau de titre qui la contient** — sa partie.
 */

/** Un titre de section ou de partie. */
export interface SectionTitle {
  text: string
  level: number
}

/** Une question à sa place dans une partie. */
export interface QuestionSpot {
  id: string
  /**
   * Son **passage** : le chemin, d'enfant en enfant depuis la partie, du bloc
   * qui porte son ancre (#213 : le bloc entier, ou le premier bloc de son
   * passage marqué) ; nul pour une question de section, sur le titre.
   */
  passage: number[] | null
}

/** Une partie : un titre (nul pour le texte direct sous le titre de la
 *  section, ou repris après un titre vide), ses blocs, ses questions. */
export interface SectionPart {
  key: string
  title: SectionTitle | null
  /** Les blocs, questions comprises (le texte les cache, la colonne de
   *  droite les montre). */
  blocks: JSONContent[]
  /** L'index au premier rang du document de chaque bloc de `blocks`. */
  at: number[]
  questions: QuestionSpot[]
  /** Où une question ajoutée se pose dans le document (index au premier
   *  rang) : juste après le dernier bloc non vide de la partie, ou après son
   *  titre (`anchorQuestion` l'ancre au bloc juste avant). */
  end: number
  /** Le titre qui ouvre la partie : ses questions sont celles de la
   *  section (#213). */
  head: JSONContent | null
}

export interface QuestionSection {
  key: string
  title: SectionTitle | null
  parts: SectionPart[]
  /** Ses nœuds au premier rang du document, `[from, to[` : son titre
   *  compris, jusqu'au titre de la section suivante — le fragment qu'on
   *  envoie pour ses idées centrales. */
  from: number
  to: number
  /** Le nombre de questions de la section, toutes parties comprises. */
  count: number
}

const blank = (node: JSONContent) =>
  node.type === PARAGRAPH && !node.content?.length

/** Le texte d'un nœud, ses morceaux bout à bout. */
function textOf(node: JSONContent): string {
  if (node.text) return node.text
  return (node.content ?? []).map(textOf).join('')
}

/** Une partie a quelque chose à montrer : du texte, ou des questions. */
const filled = (part: SectionPart) =>
  part.questions.length > 0 || part.blocks.some((b) => !blank(b))

/**
 * Les sections du document (celui de l'éditeur : `toEditorDoc`). Une partie
 * sans titre et vide disparaît quand sa section en a d'autres (un H1 suivi
 * tout de suite d'un H2) ; une section sans titre et vide aussi, sauf si
 * c'est la seule (une page vierge garde de quoi poser une question).
 */
export function questionSections(doc: JSONContent): QuestionSection[] {
  const sections: QuestionSection[] = []
  const path: SectionTitle[] = []
  let section: QuestionSection | null = null
  let part: SectionPart | null = null

  const content = doc.content ?? []
  const openSection = (
    key: string,
    title: SectionTitle | null,
    from: number,
  ) => {
    if (section) section.to = from
    section = { key, title, parts: [], from, to: content.length, count: 0 }
    sections.push(section)
  }
  const openPart = (
    into: QuestionSection,
    key: string,
    title: SectionTitle | null,
    end: number,
    head: JSONContent | null = null,
  ) => {
    part = { key, title, blocks: [], at: [], questions: [], end, head }
    into.parts.push(part)
  }

  content.forEach((node, i) => {
    if (node.type === HEADING) {
      const level = Number(node.attrs?.level ?? 1)
      const text = textOf(node).trim()
      const depth = path.length
      while (path.length && path[path.length - 1].level >= level) path.pop()
      // Un titre vide qui ne ferme rien ne compte pas.
      if (!text && path.length === depth) return
      if (text) path.push({ text, level })
      const title = text ? path[path.length - 1] : null
      if (!section || !path.length || (text && path.length === 1)) {
        openSection(String(i), path[0] ?? null, i)
        openPart(section!, String(i), null, i + 1, node)
      } else openPart(section, String(i), title, i + 1, node)
      return
    }
    if (!section || !part) {
      openSection('start', null, 0)
      openPart(section!, 'start', null, 0)
    }
    const into = part!
    into.blocks.push(node)
    into.at.push(i)
    if (!blank(node)) into.end = i + 1
  })

  // Une question n'a qu'une place : la première (un passage coupé en deux).
  const seen = new Set<string>()
  return sections
    .map((s) => {
      s.parts.forEach((p) => {
        if (p.head)
          for (const id of anchoredIds(p.head))
            if (!seen.has(id) && seen.add(id))
              p.questions.push({ id, passage: null })
        collect(p.blocks, [], p.questions, seen)
      })
      const parts = s.parts.filter(
        (p, k) => filled(p) || p.title || (k === 0 && s.parts.length === 1),
      )
      const count = parts.reduce((n, p) => n + p.questions.length, 0)
      return { ...s, parts, count }
    })
    .filter(
      (s, _, all) =>
        s.title || all.length === 1 || s.parts.some((p) => filled(p)),
    )
}

/** Les ids des questions ancrées sur un bloc de texte : les siennes
 *  (`questions`), puis celles des passages marqués dans son texte. */
function anchoredIds(node: JSONContent): string[] {
  const ids: unknown = node.attrs?.[QUESTIONS]
  const found = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string')
    : []
  for (const child of node.content ?? [])
    for (const mark of child.marks ?? []) {
      const id: unknown = mark.attrs?.id
      if (mark.type === QUESTION_REF && typeof id === 'string') found.push(id)
    }
  return found
}

/** Les questions d'une suite de blocs, en profondeur, avec leur passage : le
 *  bloc de texte qui porte leur ancre. */
function collect(
  nodes: JSONContent[],
  base: number[],
  out: QuestionSpot[],
  seen: Set<string>,
) {
  nodes.forEach((node, i) => {
    const path = [...base, i]
    // Un ancien bloc Question (une base pas encore migrée) : sans passage.
    const legacy: unknown = node.type === QUESTION ? node.attrs?.id : null
    const ids =
      typeof legacy === 'string'
        ? [legacy]
        : node.type === PARAGRAPH || node.type === HEADING
          ? anchoredIds(node)
          : []
    for (const id of ids)
      if (!seen.has(id) && seen.add(id))
        out.push({ id, passage: legacy ? null : path })
    if (node.type !== PARAGRAPH && node.type !== HEADING && node.content)
      collect(node.content, path, out, seen)
  })
}

/**
 * Le document avec la question `id` ancrée là où elle se pose (`at`, un
 * index au premier rang : `SectionPart.end`, `ideaPlace`) — au **bloc juste
 * avant** (#213) : le dernier paragraphe ou titre qui a du texte, en
 * remontant ; un titre, c'est une question de section. Sans rien au-dessus
 * (une page vide), un paragraphe vide la porte, en `at`.
 */
export function anchorQuestion(
  doc: JSONContent,
  at: number,
  id: string,
): JSONContent {
  const content = doc.content ?? []
  const start = Math.min(at, content.length)
  for (let i = start - 1; i >= 0; i--) {
    const anchored = withQuestion(content[i], id)
    if (anchored) return { ...doc, content: content.toSpliced(i, 1, anchored) }
  }
  return {
    ...doc,
    content: content.toSpliced(start, 0, {
      type: PARAGRAPH,
      attrs: { [QUESTIONS]: [id] },
    }),
  }
}

/** Le nœud, `id` ajouté aux questions de son dernier paragraphe ou titre qui
 *  a du texte ; nul s'il n'en a aucun. */
function withQuestion(node: JSONContent, id: string): JSONContent | null {
  if (
    (node.type === PARAGRAPH || node.type === HEADING) &&
    textOf(node).trim()
  ) {
    const ids: unknown = node.attrs?.[QUESTIONS]
    return {
      ...node,
      attrs: {
        ...node.attrs,
        [QUESTIONS]: [...(Array.isArray(ids) ? ids : []), id],
      },
    }
  }
  const kids = node.content ?? []
  for (let k = kids.length - 1; k >= 0; k--) {
    const done = withQuestion(kids[k], id)
    if (done) return { ...node, content: kids.toSpliced(k, 1, done) }
  }
  return null
}

/**
 * La position, dans un document ProseMirror, du nœud au bout d'un chemin
 * d'enfants (`QuestionSpot.passage`) ; nulle si le chemin n'y mène pas.
 */
export function posOfPath(doc: PMNode, path: number[]): number | null {
  let node = doc
  let pos = 0
  for (const index of path) {
    if (index >= node.childCount) return null
    // Le contenu commence après l'ouverture du nœud (pas pour la racine).
    let at = node === doc ? 0 : pos + 1
    for (let k = 0; k < index; k++) at += node.child(k).nodeSize
    pos = at
    node = node.child(index)
  }
  return path.length ? pos : null
}
