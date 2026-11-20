import { useTheme } from 'next-themes'

/**
 * Bascule clair / sombre.
 *
 * Une seule forme qui se métamorphose, plutôt que deux icônes qui se croisent :
 * le disque grossit, les rayons se rétractent en pivotant, et un masque vient
 * mordre un croissant. Tout est piloté par la variante `dark:` — donc par la
 * classe posée sur `<html>`, sans état React. Aucun scintillement au montage.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Changer de thème"
      title="Changer de thème"
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        strokeLinecap="round"
      >
        <mask id="theme-toggle-moon">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {/* Hors champ en clair, il glisse sur le disque en sombre pour
              découper le croissant. */}
          <circle
            cx="24"
            cy="10"
            r="6"
            fill="black"
            className="transition-transform duration-[250ms] [transition-timing-function:cubic-bezier(0,0,0,1)] dark:-translate-x-[7px]"
          />
        </mask>

        {/* Le disque : soleil en clair, il grossit pour devenir la lune. */}
        <circle
          cx="12"
          cy="12"
          r="6"
          fill="currentColor"
          mask="url(#theme-toggle-moon)"
          className="origin-center transition-transform duration-500 [transform-box:fill-box] [transition-timing-function:cubic-bezier(.5,1.25,.75,1.25)] dark:scale-[1.75]"
        />

        {/* Les rayons se rétractent en pivotant. */}
        <g
          stroke="currentColor"
          strokeWidth="1.5"
          className="origin-center transition duration-500 [transform-box:fill-box] [transition-timing-function:cubic-bezier(.5,1.5,.75,1.25)] dark:-rotate-[25deg] dark:opacity-0"
        >
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </g>
      </svg>
    </button>
  )
}
