import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useEffect } from 'react'
import { getAvatar } from '../lib/themes'
import type { RankInfo } from '../lib/types'

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'coin'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  full?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'accent-button hover:brightness-110 active:scale-[0.98]',
  secondary:
    'border border-line bg-surface-2 text-ink hover:border-accent/60 hover:bg-surface-2/80 active:scale-[0.98]',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2/60 active:scale-[0.98]',
  danger: 'border border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 active:scale-[0.98]',
  coin: 'border border-amber-300/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25 active:scale-[0.98]',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  )
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | null
  trailing?: ReactNode
}

export function Field({ label, hint, error, trailing, className = '', ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
        {hint ? <span className="font-medium normal-case tracking-normal text-muted/80">{hint}</span> : null}
      </span>
      <span className="relative block">
        <input
          {...rest}
          className={[
            'focus-ring w-full rounded-xl border bg-surface-2/70 px-4 py-3 text-sm text-ink transition placeholder:text-muted/70',
            error ? 'border-rose-400/70' : 'border-line focus:border-accent/70',
            trailing ? 'pr-12' : '',
            className,
          ].join(' ')}
        />
        {trailing ? <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</span> : null}
      </span>
      {error ? <span className="mt-1.5 block text-xs font-medium text-rose-300">{error}</span> : null}
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* -------------------------------------------------------------------------- */
export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}) {
  return <Tag className={`glass p-5 ${className}`}>{children}</Tag>
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'gold' | 'success' | 'danger'
  className?: string
}) {
  const tones = {
    neutral: 'border-line bg-surface-2 text-muted',
    accent: 'border-accent/40 bg-accent/15 text-ink',
    gold: 'border-amber-300/40 bg-amber-400/15 text-amber-100',
    success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
    danger: 'border-rose-400/40 bg-rose-500/15 text-rose-100',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function ProgressBar({
  value,
  className = '',
  color,
  showLabel = false,
}: {
  value: number
  className?: string
  color?: string
  showLabel?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-surface-2/80 ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${clamped}%`,
          background: color ?? 'linear-gradient(90deg, var(--accent), var(--accent-2))',
        }}
      />
      {showLabel ? null : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Identity chips                                                             */
/* -------------------------------------------------------------------------- */
export function Avatar({ slug, size = 40, ring }: { slug: string | null | undefined; size?: number; ring?: string }) {
  const avatar = getAvatar(slug)
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border text-center"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `radial-gradient(circle at 30% 25%, ${avatar.accent}55, transparent 65%)`,
        borderColor: ring ?? `${avatar.accent}88`,
        boxShadow: `0 0 24px -8px ${avatar.accent}`,
      }}
      title={avatar.name}
    >
      {avatar.emoji}
    </span>
  )
}

export function RankBadge({
  rank,
  elo,
  size = 'md',
}: {
  rank: RankInfo | { name: string; color: string }
  elo?: number
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border font-bold uppercase tracking-wide',
        size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs',
      ].join(' ')}
      style={{
        borderColor: `${rank.color}66`,
        background: `${rank.color}22`,
        color: rank.color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: rank.color }} />
      {rank.name}
      {typeof elo === 'number' ? <span className="font-mono text-[11px] opacity-80">{elo} ELO</span> : null}
    </span>
  )
}

export function CoinPill({ coins, className = '' }: { coins: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1.5 text-sm font-bold text-amber-100 ${className}`}
    >
      <span aria-hidden>🪙</span>
      {coins.toLocaleString()}
    </span>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="glass-2 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className={`glass-solid relative z-10 w-full ${width} animate-pop p-6`}>
        {title ? <h3 className="mb-3 text-lg font-bold">{title}</h3> : null}
        <div className="text-sm text-ink/90">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action}
    </div>
  )
}
