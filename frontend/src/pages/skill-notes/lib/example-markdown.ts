/**
 * Le **Markdown léger** du texte d'un exemple (décision de l'utilisateur,
 * 17/11) : l'exemple reste du texte, sa bulle le lit mis en forme.
 *
 * - un bloc de code entre ```` ``` ```` (```` ```sql ```` : son langage,
 *   coloré comme les blocs des notes) ;
 * - un tableau : des lignes `| a | b |`, la deuxième `| --- | --- |` ;
 * - une liste : des lignes qui commencent par `- `, `• ` ou `* ` ;
 * - en ligne : `` `code` `` et `**gras**`.
 *
 * Le reste est du texte, ligne à ligne ; une ligne vide sépare deux
 * paragraphes. Rien n'échoue : un bloc de code non fermé court jusqu'au
 * bout, un tableau sans sa ligne de tirets reste du texte.
 */

export type ExampleBlock =
  | { kind: 'text'; lines: string[] }
  | { kind: 'code'; language: string | null; code: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }

export type Inline = { kind: 'text' | 'code' | 'bold'; text: string }

const FENCE = /^\s*```\s*([\w+-]*)\s*$/
const ITEM = /^\s*(?:[-*•])\s+(.*)$/
const ROW = /^\s*\|.*\|?\s*$/
const RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/

/** Les cellules d'une ligne `| a | b |`. */
function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/** Les blocs du texte d'un exemple. */
export function exampleBlocks(text: string): ExampleBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ExampleBlock[] = []
  // Le paragraphe en cours, prolongé tant que les lignes sont du texte.
  let para: string[] | null = null
  const flush = () => {
    if (para?.length) blocks.push({ kind: 'text', lines: para })
    para = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const body: string[] = []
      while (++i < lines.length && !FENCE.test(lines[i])) body.push(lines[i])
      blocks.push({
        kind: 'code',
        language: fence[1] || null,
        code: body.join('\n'),
      })
      continue
    }
    if (ROW.test(line) && RULE.test(lines[i + 1] ?? '')) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      i++
      while (i + 1 < lines.length && ROW.test(lines[i + 1]))
        rows.push(cells(lines[++i]))
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    const item = ITEM.exec(line)
    if (item) {
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'list') last.items.push(item[1])
      else blocks.push({ kind: 'list', items: [item[1]] })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    para = [...(para ?? []), line]
  }
  flush()
  return blocks
}

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/

/** Les morceaux d'une ligne : du texte, du `code`, du **gras**. */
export function inlines(line: string): Inline[] {
  return line
    .split(INLINE)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 2
        ? { kind: 'code', text: part.slice(1, -1) }
        : part.startsWith('**') && part.endsWith('**') && part.length > 4
          ? { kind: 'bold', text: part.slice(2, -2) }
          : { kind: 'text', text: part },
    )
}
