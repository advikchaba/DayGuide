import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { Avatar, Badge, Button, Field } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { getAvatar } from '../lib/themes'
import type { Profile } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

/**
 * First-login username claim. Free the first time, 400 coins afterwards.
 */
export function OnboardingPage() {
  const { profile, refresh } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.username) return
    // Already onboarded - straight to the checklist.
    navigate('/app', { replace: true })
  }, [profile, navigate])

  // Debounced availability check.
  useEffect(() => {
    const valid = /^[A-Za-z0-9_.]{3,20}$/.test(username)
    if (!valid) {
      setAvailable(null)
      return
    }
    let cancelled = false
    setChecking(true)
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.public<{ available: boolean }>(
          `/usernames/available?username=${encodeURIComponent(username)}`,
        )
        if (!cancelled) setAvailable(result.available)
      } catch {
        if (!cancelled) setAvailable(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [username])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
      setError('3–20 characters using letters, numbers, dot or underscore.')
      return
    }
    if (available === false) {
      setError('That username is already taken — pick another one.')
      return
    }

    setSaving(true)
    try {
      await api.post<Profile>('/me/username', { username })
      await refresh()
      push(`@${username} is yours. Build your first timed routine.`, 'success')
      navigate('/routines/new', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not claim that username.')
    } finally {
      setSaving(false)
    }
  }

  const preview = getAvatar(profile?.avatar_slug)

  return (
    <AuthShell
      title="Claim your username"
      subtitle="This is what other players will see on the ladder. Free right now — 400 coins later."
    >
      <div className="mb-5 flex items-center gap-4 rounded-lg bg-surface-2 p-4">
        <Avatar slug={profile?.avatar_slug} size={52} />
        <div className="min-w-0">
          <p className="truncate text-base font-bold">
            {username ? `@${username}` : '@yourname'}
          </p>
          <p className="text-xs text-muted">
            {preview.name} profile picture · {profile?.coins ?? 0} coins
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label="Username"
          placeholder="e.g. RoutineRocket"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/\s/g, ''))}
          maxLength={20}
          error={error}
          autoFocus
          trailing={
            checking ? (
              <span className="text-xs text-muted">…</span>
            ) : available === true ? (
              <span className="text-xs font-bold text-emerald-300">free</span>
            ) : available === false ? (
              <span className="text-xs font-bold text-rose-300">taken</span>
            ) : null
          }
        />

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={available === true ? 'success' : 'neutral'}>{available === true ? 'Available' : 'Tap to check'}</Badge>
          <Badge tone="neutral">Letters, numbers, _ and .</Badge>
        </div>

        <Button type="submit" size="lg" full loading={saving} disabled={available === false}>
          Claim username
        </Button>
      </form>
    </AuthShell>
  )
}
