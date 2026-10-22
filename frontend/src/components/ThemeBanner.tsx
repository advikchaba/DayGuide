import type { ThemeDefinition } from '../lib/themes'

/**
 * Image themes get a real foreground panel instead of only a faint page
 * backdrop, so the artwork is obvious on every authenticated screen.
 */
export function ThemeBanner({ theme }: { theme: ThemeDefinition }) {
  if (!theme.image) return null

  return (
    <section className="glass mb-6 overflow-hidden">
      <div className="grid md:grid-cols-[1.5fr_1fr]">
        <div className="relative min-h-[150px] md:min-h-[190px]">
          <img
            src={theme.image}
            alt={theme.imageAlt ?? `${theme.name} theme artwork`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: theme.imagePosition ?? 'center' }}
            loading="eager"
            decoding="async"
          />
          <span className="absolute left-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
            {theme.name}
          </span>
        </div>

        <div className="flex flex-col justify-between gap-4 p-5 md:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted">Image theme active</p>
            <h2 className="mt-1.5 text-2xl tracking-tight">{theme.name}</h2>
            <p className="mt-2 text-sm text-muted">{theme.description}</p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="h-6 w-6 rounded"
              style={{ background: theme.vars['--bg'] }}
              title="Background"
            />
            <span
              className="h-6 w-6 rounded"
              style={{ background: theme.vars['--surface-2'] }}
              title="Surface"
            />
            <span
              className="h-6 w-6 rounded"
              style={{ background: theme.vars['--accent'] }}
              title="Accent"
            />
            <span
              className="h-6 w-6 rounded"
              style={{ background: theme.vars['--accent-2'] }}
              title="Secondary accent"
            />
            <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Palette</span>
          </div>
        </div>
      </div>
    </section>
  )
}
