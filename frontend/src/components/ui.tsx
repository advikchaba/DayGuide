import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { getAvatar } from '../lib/themes'
import { RANK_TIERS, type RankInfo } from '../lib/types'

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
  secondary: 'bg-surface-2 text-ink hover:brightness-110 active:scale-[0.98]',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2 active:scale-[0.98]',
  danger: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 active:scale-[0.98]',
  coin: 'bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 active:scale-[0.98]',
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
        'focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-bold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50',
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
      <span className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
        {label}
        {hint ? <span className="font-medium normal-case tracking-normal text-muted">{hint}</span> : null}
      </span>
      <span className="relative block">
        <input
          {...rest}
          className={[
            'focus-ring w-full rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink transition placeholder:text-muted',
            error ? 'bg-rose-500/10' : '',
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
        <h2 className="text-2xl tracking-tight">{title}</h2>
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
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-ink',
    gold: 'bg-amber-400/15 text-amber-200',
    success: 'bg-emerald-500/15 text-emerald-200',
    danger: 'bg-rose-500/15 text-rose-200',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${tones[tone]} ${className}`}
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
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${clamped}%`,
          background: color ?? 'var(--accent)',
        }}
      />
      {showLabel ? null : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Identity chips                                                             */
/* -------------------------------------------------------------------------- */
export function Avatar({
  slug,
  size = 40,
  src,
}: {
  slug: string | null | undefined
  size?: number
  src?: string | null
}) {
  const avatar = getAvatar(slug)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        title="Profile picture"
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="inline-block shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg text-center font-black"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `color-mix(in srgb, ${avatar.accent} 22%, var(--surface-2))`,
        color: avatar.accent,
      }}
      title={avatar.name}
    >
      {avatar.initials}
    </span>
  )
}

export function rankTier(name: string | null | undefined): RankInfo | undefined {
  return RANK_TIERS.find((tier) => tier.name === name)
}

/**
 * Rank logos are plain geometric marks. They live on the ladder page only.
 */
export function RankMark({ name, size = 16 }: { name: string; size?: number }) {
  const tier = rankTier(name)
  const color = tier?.color ?? '#b87333'
  const box = { width: size, height: size, flexShrink: 0, display: 'inline-block' } as const

  switch (name) {
    case 'Copper':
      return <span style={{ ...box, background: color, borderRadius: 2 }} aria-hidden />
    case 'Bronze':
      return <span style={{ ...box, width: size * 1.45, height: size * 0.8, background: color, borderRadius: 2 }} aria-hidden />
    case 'Silver':
      return <span style={{ ...box, background: color, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} aria-hidden />
    case 'Gold':
      return <span style={{ ...box, background: color, transform: 'rotate(45deg)', borderRadius: 1 }} aria-hidden />
    case 'Platinum':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
          <path fill={color} d="M2.5 18.5h19L19.4 7l-5.1 3.8L12 3.8 9.7 10.8 4.6 7z" />
          <path fill={color} d="M3.4 20h17.2v1.6H3.4z" />
        </svg>
      )
    case 'Ruby':
      return (
        <span
          style={{
            ...box,
            background: color,
            clipPath: 'polygon(50% 0, 100% 36%, 50% 100%, 0 36%)',
          }}
          aria-hidden
        />
      )
    default:
      return <span style={{ ...box, background: color, borderRadius: 2 }} aria-hidden />
  }
}

export function RankBadge({
  rank,
  elo,
  size = 'md',
}: {
  rank: RankInfo | { name: string; color?: string }
  elo?: number
  size?: 'sm' | 'md'
}) {
  const tier = rankTier(rank.name)
  const color = tier?.color ?? ('color' in rank && rank.color ? rank.color : 'var(--text)')
  return (
    <span
      className={[
        'inline-flex items-center gap-2 font-bold uppercase tracking-wide',
        size === 'sm' ? 'text-[10px]' : 'text-xs',
      ].join(' ')}
      style={{ color }}
    >
      <RankMark name={rank.name} size={size === 'sm' ? 12 : 15} />
      {rank.name}
      {typeof elo === 'number' ? <span className="font-mono text-[11px] font-semibold opacity-75">{elo} ELO</span> : null}
    </span>
  )
}

export function CoinPill({ coins, className = '' }: { coins: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-surface-2 px-3 py-1.5 text-sm font-bold text-ink ${className}`}>
      {coins.toLocaleString()} coins
    </span>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="glass-2 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
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
      <div className="absolute inset-0 bg-black/75" onClick={onClose} aria-hidden />
      <div className={`glass-solid relative z-10 w-full ${width} animate-pop p-6`} role="dialog" aria-modal="true">
        {title ? <h3 className="mb-3 text-lg font-bold">{title}</h3> : null}
        <div className="text-sm text-ink">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action}
    </div>
  )
}
