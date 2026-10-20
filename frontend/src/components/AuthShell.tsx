import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from './Logo'

/**
 * Split-screen shell used by the login / signup / onboarding screens.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="app-shell">
      <div className="app-content grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
          <Logo />
          <div className="relative z-10 max-w-md">
            <h1 className="text-4xl font-black leading-tight tracking-tight">
              Turn your daily routine into <span className="gradient-text">competitiveness</span>
            </h1>
            <p className="mt-4 text-sm text-muted">
              Tick off your checklist, earn coins for every task, unlock themes and profile pictures, then race other
              players up the Copper → Ruby ladder.
            </p>

            <ul className="mt-8 space-y-3 text-sm">
              {[
                ['🪙', '+200 coins for a perfect routine, +50 ELO'],
                ['📸', 'Photo verification keeps the ladder honest'],
                ['⚔️', 'Ranked races: first to finish takes the ELO'],
              ].map(([icon, text]) => (
                <li key={text} className="glass-2 flex items-center gap-3 px-4 py-3">
                  <span aria-hidden>{icon}</span>
                  <span className="text-muted">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">Built with React, FastAPI and Supabase.</p>
        </aside>

        {/* Form panel */}
        <section className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <Logo />
            </div>

            <div className="glass-solid animate-fade-up p-6 sm:p-8">
              <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>

            {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}

            <p className="mt-6 text-center text-xs text-muted">
              <Link to="/" className="focus-ring rounded underline-offset-4 hover:underline">
                ← Back to home
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

/** Google logo mark for the OAuth button. */
export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.02-6.46-4.75H1.7v3a11.5 11.5 0 0 0 10.3 6.33Z"
      />
      <path fill="#FBBC05" d="M5.54 14.17a6.9 6.9 0 0 1 0-4.4v-3H1.7a11.5 11.5 0 0 0 0 10.4l3.84-3Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.26 15.1.5 12 .5A11.5 11.5 0 0 0 1.7 6.77l3.84 3C6.45 6.77 9 4.75 12 4.75Z"
      />
    </svg>
  )
}

export function GoogleButton({
  onClick,
  label,
  loading,
  disabled,
}: {
  onClick: () => void
  label: string
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="focus-ring flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface-2/80 px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent/50 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? 'Redirecting…' : label}
    </button>
  )
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
