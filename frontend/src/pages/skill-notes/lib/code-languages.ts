import bash from 'highlight.js/lib/languages/bash'
import type { HLJSApi, Language } from 'highlight.js'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import { createLowlight } from 'lowlight'

/**
 * Les langages d'un bloc de code, au compte-gouttes : Shell et Python
 * d'abord, puis SQL. Un bloc sans langage est du texte brut, jamais coloré.
 * `id` : l'attribut `language` du bloc (et la classe `language-…` du HTML,
 * qui le porte au collage Markdown — ```` ```python ````). Ajouter un
 * langage : sa grammaire highlight.js au colorieur, une ligne ici, ses
 * alias dans `ALIASES`.
 */
export const CODE_LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'bash', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
] as const

/** Le libellé d'un bloc sans langage. */
export const PLAIN_TEXT = 'Texte brut'

/** Les autres noms d'un langage, tels qu'un Markdown collé les écrit. */
const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  postgres: 'sql',
  postgresql: 'sql',
  pgsql: 'sql',
  psql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
}

/** Le langage connu d'un attribut `language` (alias compris), sinon nul. */
export function knownLanguage(language: string | null | undefined) {
  if (!language) return null
  const id = ALIASES[language.toLowerCase()] ?? language.toLowerCase()
  return CODE_LANGUAGES.find((l) => l.id === id) ?? null
}

/** Le libellé du langage d'un bloc ; un langage inconnu s'affiche tel quel. */
export function languageLabel(language: string | null | undefined): string {
  if (!language) return PLAIN_TEXT
  return knownLanguage(language)?.label ?? language
}

/**
 * Bash, plus le **prompt** d'une ligne de terminal : `$ python -v` — le `$`
 * (ou `%`) en début de ligne, puis la commande qui le suit. Bash seul n'y
 * voit rien (ni le prompt, ni une commande qui n'est pas intégrée au shell),
 * et la ligne restait d'une seule couleur.
 */
function shell(hljs: HLJSApi): Language {
  const base = bash(hljs)
  return {
    ...base,
    contains: [
      {
        begin: [/^[ \t]*[$%]/, / +/, /[^\s;|&]+/],
        beginScope: { 1: 'meta.prompt', 3: 'title.function' },
      },
      ...(base.contains ?? []),
    ],
  }
}

const registry = createLowlight({ bash: shell, python, sql })

/**
 * Le colorieur des blocs. Un langage qu'on ne connaît pas (collé d'ailleurs,
 * ```` ```js ````) reste en texte brut : sans cela, l'extension devine le
 * langage (`highlightAuto`) parmi les seuls qu'on a — et colorie du
 * JavaScript en Python.
 */
export const lowlight = {
  ...registry,
  highlightAuto: (value: string) => ({
    type: 'root' as const,
    children: [{ type: 'text' as const, value }],
    data: { language: undefined, relevance: 0 },
  }),
}
