import { Extension } from '@tiptap/core'
import { DOMParser } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { marked } from 'marked'

/** Un HTML qui porte des blocs : le collage ordinaire sait le lire. */
const STRUCTURED = /<(p|li|ul|ol|h[1-6]|table|pre|blockquote|div|br)\b/i

/** Du Markdown : un marqueur de bloc en début de ligne, ou une marque en ligne. */
const MARKDOWN =
  /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\[[ xX]\]\s)|\*\*[^*\n]+\*\*|`[^`\n]+`/m

/** Les cellules d'une ligne de tableau Markdown (`| a | b |`), bords retirés. */
function cellsOf(line: string): number {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).length
}

/**
 * Notion laisse tels quels, dans le Markdown d'un tableau, les retours à la
 * ligne d'une cellule : la rangée s'étale alors sur plusieurs lignes, que le
 * Markdown lirait comme autant de rangées. On les recoud : une rangée court
 * jusqu'à ce qu'elle finisse par `|` avec le nombre de cellules de l'en-tête ;
 * les retours à la ligne deviennent des `<br>` (sauts de ligne dans la
 * cellule).
 */
export function joinTableRows(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let cols = 0
  let row: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (row !== null) {
      row += '<br>' + t
      if (t.endsWith('|') && cellsOf(row) >= cols) {
        out.push(row)
        row = null
      }
      continue
    }
    // Un en-tête de tableau : `| … |` suivi de `| --- | … |`.
    const next = lines[i + 1]?.trim() ?? ''
    if (t.startsWith('|') && /^\|?\s*:?-{3,}/.test(next)) {
      cols = cellsOf(t)
      out.push(line)
      continue
    }
    if (cols && t.startsWith('|')) {
      if (/^\|?\s*:?-{3,}/.test(t) || (t.endsWith('|') && cellsOf(t) >= cols))
        out.push(line)
      else row = t
      continue
    }
    if (cols && !t.startsWith('|')) cols = 0
    out.push(line)
  }
  if (row !== null) out.push(row)
  return out.join('\n')
}

/**
 * Une image du Markdown qui ne pointe pas une adresse lisible ici —
 * `attachment:…` de Notion, un fichier local — devient un bloc image vide
 * (« Ajouter une image ») : à re-déposer, plutôt qu'une image cassée.
 */
function dropForeignImages(holder: HTMLElement) {
  for (const img of holder.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    if (!/^(https?:|data:image\/|\/media\/)/.test(src))
      img.setAttribute('src', '')
  }
}

/**
 * Coller du Markdown (design #90, « à la Notion ») : Notion — et bien
 * d'autres — ne donne souvent, au presse-papiers, que du texte en Markdown
 * (« - », quatre espaces par niveau, `**gras**`) sans HTML structuré. Le
 * collage ordinaire en ferait des lignes brutes ; ici, le texte est lu comme
 * du Markdown et devient des blocs (titres, puces imbriquées, numérotées,
 * citations, code, tableaux — cellules sur plusieurs lignes comprises —, gras,
 * italique, code en ligne). Un HTML structuré, un
 * collage dans du code, ou une ligne sans Markdown passent leur chemin.
 */
export const pasteMarkdown = Extension.create({
  name: 'pasteMarkdown',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData
            if (!data) return false
            const text = data.getData('text/plain')
            if (!text.trim() || !MARKDOWN.test(text)) return false
            if (view.state.selection.$from.parent.type.spec.code) return false
            // Notion fabrique son HTML depuis ce même Markdown, et y casse
            // déjà les cellules sur plusieurs lignes (une rangée par ligne) :
            // dès qu'un tableau en a, le Markdown recousu fait foi, même face
            // à un HTML structuré.
            const joined = joinTableRows(text)
            if (joined === text && STRUCTURED.test(data.getData('text/html')))
              return false

            const html = marked.parse(joined, {
              async: false,
              gfm: true,
            })
            const holder = document.createElement('div')
            holder.innerHTML = html
            dropForeignImages(holder)
            const slice = DOMParser.fromSchema(view.state.schema).parseSlice(
              holder,
              { preserveWhitespace: false },
            )
            view.dispatch(
              view.state.tr
                .replaceSelection(slice)
                .scrollIntoView()
                .setMeta('uiEvent', 'paste'),
            )
            return true
          },
        },
      }),
    ]
  },
})
