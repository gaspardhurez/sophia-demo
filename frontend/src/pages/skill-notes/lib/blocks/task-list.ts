import { TaskItem, TaskList } from '@tiptap/extension-list'
import { ListTodo } from 'lucide-react'

import type { BlockSpec } from './types'

/** La coche, en image de fond de la case cochée. */
const check = (color: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3 7.2l2.6 2.6L11 4.4' fill='none' stroke='${color}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`

/**
 * La liste de tâches (relevé Notion §1.4) : `[] ` ou `[x] ` en début de
 * ligne (règle de TaskItem). Une case de 16 × 16 centrée dans 24 px, rayon
 * 2, bordure 1,5 px ; cochée, fond d'accent et coche (blanche sur l'accent
 * sombre du thème clair, sombre sur l'accent clair du thème sombre), en
 * 0,2 s ; le texte coché barré, à 70 %. Imbricable (Tab, ⇧Tab).
 */
export const taskListBlock: BlockSpec = {
  name: 'taskList',
  nodes: ['taskList', 'taskItem'],
  extensions: () => [
    TaskList.configure({
      HTMLAttributes: {
        style: `--check: ${check('%23fff')}; --check-dark: ${check('%2327272a')}`,
        // `data-[…]` : plus spécifique que les puces de la prose (`ul`).
        class: [
          'data-[type=taskList]:list-none data-[type=taskList]:pl-0 data-[type=taskList]:text-foreground',
          // Pas de puce de la prose (`ul>li::before`) : la case en tient lieu.
          'data-[type=taskList]:[&>li]:before:content-none',
          '[&>li]:flex [&>li]:items-start',
          // Serrées comme les listes (3 px dessus et dessous), case comprise.
          '[&>li>label]:mt-[3px] [&>li>label]:flex [&>li>label]:h-[1lh] [&>li>label]:w-6 [&>li>label]:shrink-0 [&>li>label]:items-center [&>li>label]:justify-center',
          '[&>li>div]:min-w-0 [&>li>div]:flex-1 [&>li>div]:pl-1.5 [&>li>div>p]:py-[3px]',
          '[&>li>label>input]:size-4 [&>li>label>input]:cursor-pointer [&>li>label>input]:appearance-none [&>li>label>input]:rounded-[2px] [&>li>label>input]:border-[1.5px] [&>li>label>input]:border-foreground/70 [&>li>label>input]:bg-size-[14px] [&>li>label>input]:bg-center [&>li>label>input]:bg-no-repeat [&>li>label>input]:transition-[background-color] [&>li>label>input]:duration-200 [&>li>label>input]:ease-out',
          '[&>li>label>input:checked]:border-0 [&>li>label>input:checked]:bg-(--note-accent) [&>li>label>input:checked]:bg-(image:--check) dark:[&>li>label>input:checked]:bg-(image:--check-dark)',
        ].join(' '),
      },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class:
          '[&[data-checked=true]>div>p]:line-through [&[data-checked=true]>div>p]:decoration-foreground/50 [&[data-checked=true]>div>p]:opacity-70',
      },
      a11y: {
        checkboxLabel: (_, checked) =>
          checked ? 'Décocher la tâche' : 'Cocher la tâche',
      },
    }),
  ],
  items: [
    {
      id: 'task-list',
      label: 'Liste de tâches',
      section: 'blocks',
      aliases: ['taches', 'todo', 'task', 'checkbox', 'case', 'cocher'],
      icon: ListTodo,
      markdown: '[]',
      action: { kind: 'transform', apply: (c) => c.toggleTaskList() },
    },
  ],
  list: { item: 'taskItem', marker: 0 },
  placeholder: { text: 'Tâche' },
}
