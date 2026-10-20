import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthShell, Divider, GoogleButton } from '../components/AuthShell'
import { Button, Field } from '../components/ui'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

interface LocationState {
  from?: string
}

export function LoginPage() {
  const { signIn, signInWithGoogle, mode } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as LocationState | null)?.from ?? '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Enter your email and password.')
      return
    }

    setLoading(true)
    try {
      await signIn(email.trim(), password)
      push('Welcome back!', 'success')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle(redirectTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
      setGoogleLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep your streak alive and defend your rank."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="focus-ring font-semibold text-accent hover:underline">
            Create an account
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
          required
        />

        <Field
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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

        {error ? (
          <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" full loading={loading}>
          Log in
        </Button>
      </form>

      {mode === 'dev' ? (
        <p className="mt-4 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
          Running on the local dev auth provider — no Supabase project needed. Add your Supabase URL and
          publishable key to <code className="text-ink">backend/.env</code> locally, or to the Vercel backend
          project, then redeploy to enable real accounts and Google sign-in.
        </p>
      ) : null}
    </AuthShell>
  )
}
