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
            <h1 className="text-5xl leading-[1.05]">Turn your daily routine into competitiveness</h1>
            <p className="mt-4 text-sm text-muted">
              Build a timed checklist, check tasks in when you do them, and earn coins and ELO for staying close to
              your schedule.
            </p>

            <ul className="mt-8 space-y-4 text-sm">
              {[
                'Timed tasks with +45 to +50 ELO for accurate check-ins',
                'More than 20 minutes off costs -10 to -30 ELO',
                '+200 coins for a perfect, fully on-time day',
              ].map((text, index) => (
                <li key={text} className="flex gap-3">
                  <span className="text-xs font-bold tracking-[0.2em] text-muted">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-muted">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">DayGuide · built with React, FastAPI and Supabase.</p>
        </aside>

        {/* Form panel */}
        <section className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <Logo />
            </div>

            <div className="glass-solid animate-fade-up p-6 sm:p-8">
              <h2 className="text-3xl tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>

            {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}

            <p className="mt-6 text-center text-xs text-muted">
              <Link to="/" className="focus-ring rounded underline-offset-4 hover:underline">
                Back to home
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
      className="focus-ring flex w-full items-center justify-center gap-3 rounded-lg bg-surface-2 px-4 py-3 text-sm font-bold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? 'Redirecting…' : label}
    </button>
  )
}

export function Divider({ label }: { label: string }) {
  return <div className="my-5 text-center text-xs font-bold uppercase tracking-[0.24em] text-muted">{label}</div>
}
