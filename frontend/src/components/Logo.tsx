import { Link } from 'react-router-dom'

/**
 * DayGuide mark: a guiding star with a sun centre.
 *
 * The badge uses theme surface/text tokens so it stays legible on every
 * palette, including the light theme where the old accent badge disappeared.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="DayGuide home"
      className="focus-ring inline-flex items-center gap-2.5 rounded-lg"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-lg"
        style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
        aria-hidden
      >
        <svg viewBox="0 0 100 100" className="h-[26px] w-[26px]" role="presentation">
          <path
            d="M50 4 C54 30 70 46 96 50 C70 54 54 70 50 96 C46 70 30 54 4 50 C30 46 46 30 50 4 Z"
            fill="currentColor"
          />
          <circle cx="50" cy="50" r="8.5" fill="var(--surface-2)" />
        </svg>
      </span>
      {compact ? null : (
        <span
          className="text-[1.35rem] font-normal leading-none tracking-tight"
          style={{ fontFamily: "'Abril Fatface', Georgia, serif" }}
        >
          DayGuide
        </span>
      )}
    </Link>
  )
}
