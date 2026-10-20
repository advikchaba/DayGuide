import { Link } from 'react-router-dom'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="focus-ring group inline-flex items-center gap-2.5 rounded-xl">
      <span
        className="grid h-9 w-9 place-items-center rounded-xl text-lg font-black"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--accent-ink)' }}
        aria-hidden
      >
        R
      </span>
      {compact ? null : (
        <span className="text-lg font-extrabold tracking-tight">
          Routine<span className="gradient-text">ry</span>
        </span>
      )}
    </Link>
  )
}
