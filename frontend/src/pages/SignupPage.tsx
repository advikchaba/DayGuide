import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell, Divider, GoogleButton } from '../components/AuthShell'
import { Button, Field, ProgressBar } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

interface PasswordStrength {
  score: number
  label: string
  color: string
}

function scorePassword(password: string): PasswordStrength {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  const table: Record<number, Omit<PasswordStrength, 'score'>> = {
    0: { label: 'Too short', color: '#EF4444' },
    1: { label: 'Weak', color: '#F97316' },
    2: { label: 'Okay', color: '#FACC15' },
    3: { label: 'Good', color: '#84CC16' },
    4: { label: 'Strong', color: '#22C55E' },
    5: { label: 'Excellent', color: '#22D3EE' },
  }
  return { score, ...table[score] }
}

export function SignupPage() {
  const { signUp, signInWithGoogle, mode } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirm?: string; username?: string }>({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const strength = scorePassword(password)

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {}

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
    if (password.length < 8) errors.password = 'Use at least 8 characters.'
    if (confirm !== password) errors.confirm = 'Passwords do not match.'
    if (username && !/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
      errors.username = '3–20 characters: letters, numbers, dot or underscore.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!validate()) return

    setLoading(true)
    try {
      if (username) {
        const check = await api.public<{ available: boolean }>(
          `/usernames/available?username=${encodeURIComponent(username)}`,
        )
        if (!check.available) {
          setFieldErrors((current) => ({ ...current, username: 'That username is already taken.' }))
          setLoading(false)
          return
        }
      }

      const { needsEmailConfirmation } = await signUp(email.trim(), password, username || undefined)
      if (needsEmailConfirmation) {
        setConfirmationSent(true)
      } else {
        push('Account created. Welcome to Routinery!', 'success')
        navigate('/onboarding', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed.')
      setGoogleLoading(false)
    }
  }

  if (confirmationSent) {
    return (
      <AuthShell title="Check your inbox" subtitle="One more step to start earning coins.">
        <div className="space-y-4 text-sm text-muted">
          <p>
            We sent a confirmation link to <span className="font-semibold text-ink">{email}</span>. Click it to activate
            your account, then log in to pick your username.
          </p>
          <Link to="/login">
            <Button full size="lg">
              Go to login
            </Button>
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Pick a routine, earn coins, climb the ladder."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="focus-ring font-semibold text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton onClick={handleGoogle} label="Sign in with Google" loading={googleLoading} />
      <Divider label="or with email" />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          required
        />

        <div>
          <Field
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            required
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            }
          />
          {password ? (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={(strength.score / 5) * 100} className="h-1.5" color={strength.color} />
              <span className="text-[11px] font-semibold" style={{ color: strength.color }}>
                {strength.label}
              </span>
            </div>
          ) : null}
        </div>

        <Field
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={fieldErrors.confirm}
          required
        />

        <Field
          label="Username"
          hint="optional — pick later"
          placeholder="e.g. RoutineRocket"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/\s/g, ''))}
          error={fieldErrors.username}
          maxLength={20}
        />

        {error ? (
          <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" full loading={loading}>
          Create account
        </Button>
      </form>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        By signing up you get 100 welcome coins and a starter routine. Usernames are free to pick once — after that a
        change costs 400 coins.
      </p>

      {mode === 'dev' ? (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          Demo mode: emails are not verified yet. Add your Supabase URL and anon key to{' '}
          <code className="text-ink">backend/.env</code> and restart the API to require real, confirmed emails and enable
          Google sign-in.
        </p>
      ) : null}
    </AuthShell>
  )
}
