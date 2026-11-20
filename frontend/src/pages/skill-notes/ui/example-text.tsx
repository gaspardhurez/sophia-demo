import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

import { knownLanguage, lowlight } from '../lib/code-languages'
import { exampleBlocks, inlines } from '../lib/example-markdown'

/** Un nœud de l'arbre que rend lowlight (hast), en React. */
type Hast =
  | { type: 'text'; value: string }
  | {
      type: 'element'
      properties?: { className?: string[] }
      children: Hast[]
    }
  | { type: 'root'; children: Hast[] }

function render(node: Hast, key: number): ReactNode {
  if (node.type === 'text') return node.value
  const children = node.children.map(render)
  if (node.type === 'root') return children
  return (
    <span key={key} className={node.properties?.className?.join(' ')}>
      {children}
    </span>
  )
}

/** Le code d'un bloc, coloré si son langage est connu. */
function Code({ language, code }: { language: string | null; code: string }) {
  const known = knownLanguage(language)
  const tree = known ? (lowlight.highlight(known.id, code) as Hast) : null
  return (
    // La bulle est étroite : une longue ligne passe à la ligne, le retrait
    // gardé, plutôt que de défiler.
    <pre className="break-words whitespace-pre-wrap rounded-lg bg-foreground/4 px-3 py-2.5 font-mono text-[12.5px] leading-[18px] [tab-size:2]">
      <code>{tree ? render(tree, 0) : code}</code>
    </pre>
  )
}

/** Une ligne, son `code` et son **gras**. */
function Line({ text }: { text: string }) {
  return inlines(text).map((part, i) =>
    part.kind === 'code' ? (
      <code
        key={i}
        className="rounded-[4px] bg-foreground/[5.5%] px-[0.35em] py-[0.1em] font-mono text-[85%] text-[color-mix(in_oklch,var(--destructive)_80%,var(--card))]"
      >
        {part.text}
      </code>
    ) : part.kind === 'bold' ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.text}
      </strong>
    ) : (
      part.text
    ),
  )
}

/**
 * Le texte d'un exemple, mis en forme (`lib/example-markdown`) : paragraphes,
 * listes, blocs de code colorés comme ceux des notes (`notes-marks` porte
 * leurs teintes), tableaux.
 */
export function ExampleText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div className={cn('notes-marks flex flex-col gap-2', className)}>
      {exampleBlocks(text).map((block, i) => {
        if (block.kind === 'code')
          return <Code key={i} language={block.language} code={block.code} />
        if (block.kind === 'list')
          return (
            <ul key={i} className="flex list-disc flex-col gap-0.5 pl-5">
              {block.items.map((item, k) => (
                <li key={k} className="pl-0.5">
                  <Line text={item} />
                </li>
              ))}
            </ul>
          )
        if (block.kind === 'table')
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px] leading-[1.45]">
                <thead>
                  <tr>
                    {block.head.map((c, k) => (
                      <th
                        key={k}
                        className="border border-border bg-foreground/4 px-2 py-1 text-left font-semibold"
                      >
                        <Line text={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {block.head.map((_, k) => (
                        <td
                          key={k}
                          className="border border-border px-2 py-1 align-top"
                        >
                          <Line text={row[k] ?? ''} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        return (
          <p key={i}>
            {block.lines.map((line, k) => (
              <span key={k}>
                {k > 0 && <br />}
                <Line text={line} />
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
