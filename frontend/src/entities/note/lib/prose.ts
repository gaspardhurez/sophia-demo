import { cn } from '@/shared/lib/utils'

/**
 * La typographie du texte des notes, à la Notion (chantier « notes à la
 * Notion », annexe §1). Le modèle d'espacement de Notion : **pas de marges
 * entre les blocs**, chaque bloc porte un padding vertical — 8 px dessus et
 * dessous pour un paragraphe (6 + 2 chez Notion), donc 16 px entre deux
 * paragraphes et 40 px pour une ligne seule. Le texte est à 8 px du bord de
 * la colonne (padding du conteneur), comme le titre de la page.
 *
 * - Texte 16/24 en police système (comme Notion) ; titres 600 avec de l'air **au-dessus seulement** — H1
 *   30/39 (32 px dessus), H2 24/31,2 (28), H3 20/26 (24), 8 px dessous.
 * - Listes serrées (30 px par élément) : marqueur dans une zone de 24 px,
 *   texte à 30 px, +32 px par niveau ; puces • ◦ ▪, numéros 1. a. i. centrés,
 *   selon le niveau de la liste (`data-level`).
 * - Citation : trait de 3 px de la couleur du texte, même taille que lui.
 * - Code : fond très léger, rayon 10, 24/22 de padding, mono 13,6/20,4.
 * - En ligne : gras 600, souligné fin, code mono 85 % sur fond léger en
 *   rouge doux, sélection teintée.
 */
export const NOTE_PROSE = cn(
  'flex flex-col px-2 text-base leading-6 text-pretty',
  // La police système, comme Notion (SF Pro sur macOS) : Inter, la police de
  // l'app, paraît plus grosse à taille égale.
  "font-[ui-sans-serif,-apple-system,system-ui,'Segoe_UI_Variable_Display','Segoe_UI',Helvetica,'Apple_Color_Emoji',Arial,sans-serif]",
  'selection:bg-(--note-accent)/28',
  // Blocs : le padding fait l'espacement.
  '[&_p]:py-2',
  '[&_:is(h1,h2,h3)]:scroll-mt-6 [&_:is(h1,h2,h3)]:pb-2 [&_:is(h1,h2,h3)]:font-heading [&_:is(h1,h2,h3)]:font-semibold',
  '[&_h1]:pt-8 [&_h1]:text-[30px] [&_h1]:leading-[39px]',
  '[&_h2]:pt-7 [&_h2]:text-2xl [&_h2]:leading-[31.2px]',
  '[&_h3]:pt-6 [&_h3]:text-xl [&_h3]:leading-[26px]',
  // Listes : le premier élément à 8 px du haut (5 + 3), les suivants serrés ;
  // le dernier à 8 px du bloc qui suit, sauf une autre liste (relevé Notion,
  // 30/10 : 40 px de ligne à ligne entre une liste et un paragraphe).
  '[&_:is(ul,ol)]:pt-[5px] [&_:is(ul,ol)]:pl-[30px] [&_li_:is(ul,ol)]:pt-0 [&_li_:is(ul,ol)]:pl-8',
  '[&_:not(li)>:is(ul,ol):not(:has(+:is(ul,ol)))]:pb-[5px]',
  '[&_li]:relative [&_li>p]:py-[3px]',
  '[&_li]:before:absolute [&_li]:before:top-[3px] [&_li]:before:-left-[30px] [&_li]:before:w-6 [&_li]:before:text-center [&_li]:before:leading-6',
  // Les puces de Notion sont en Arial 24/24, quelle que soit la police du texte.
  // Les marqueurs suivent le niveau de la liste (`data-level`, posé par
  // l'éditeur : une liste séparée de son élément par un autre bloc repart
  // au niveau 1).
  "[&_ul>li]:before:font-[Arial,sans-serif] [&_ul>li]:before:text-2xl [&_ul>li]:before:leading-6 [&_ul>li]:before:content-['•']",
  "[&_ul[data-level='2']>li]:before:content-['◦']",
  "[&_ul[data-level='3']>li]:before:content-['▪']",
  "[&_ol>li]:before:content-[counter(list-item)_'.']",
  "[&_ol[data-level='2']>li]:before:content-[counter(list-item,lower-alpha)_'.']",
  "[&_ol[data-level='3']>li]:before:content-[counter(list-item,lower-roman)_'.']",
  '[&_ol>li]:before:whitespace-nowrap',
  // Les enfants d'un paragraphe (`textItem`, après son texte) : 30 px de
  // retrait (relevé Notion, 18/11).
  "[&_[data-type='textItem']>:not(:first-child)]:ml-[30px]",
  // Citation : le trait suit la couleur du texte.
  '[&_blockquote]:my-1.5 [&_blockquote]:border-l-[3px] [&_blockquote]:border-current [&_blockquote]:pr-3.5 [&_blockquote]:pl-[22px]',
  '[&_blockquote_p]:py-0.5 [&_blockquote_p+p]:pt-2.5',
  // Code.
  '[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:bg-foreground/4 [&_pre]:px-[22px] [&_pre]:py-6',
  '[&_pre]:font-mono [&_pre]:text-[13.6px] [&_pre]:leading-[20.4px] [&_pre]:[tab-size:2]',
  // En ligne.
  '[&_strong]:font-semibold',
  '[&_:is(u,a)]:decoration-[length:0.05em] [&_:is(u,a)]:underline-offset-[10%]',
  // Un lien : texte à 70 %, soulignement discret (Notion). Pas une mention
  // (`data-mention`), qui a son propre dessin.
  '[&_a:not([data-mention])]:cursor-pointer [&_a:not([data-mention])]:underline [&_a:not([data-mention])]:decoration-current/40 [&_a:not([data-mention])]:opacity-70',
  '[&_:not(pre)>code]:rounded-[4px] [&_:not(pre)>code]:bg-foreground/[5.5%] [&_:not(pre)>code]:px-[0.4em] [&_:not(pre)>code]:py-[0.2em] [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[85%] [&_:not(pre)>code]:leading-none',
  '[&_:not(pre)>code]:text-[color-mix(in_oklch,var(--destructive)_80%,var(--card))]',
)
