import { Link } from 'react-router-dom'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="focus-ring inline-flex items-center gap-2.5 rounded-lg">
      <span
        className="grid h-9 w-9 place-items-center rounded-lg text-lg font-black"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        aria-hidden
      >
        R
      </span>
      {compact ? null : <span className="text-lg font-bold tracking-tight">Routinery</span>}
    </Link>
  )
}
