import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Badge, Button, Card, CoinPill, Field, Modal, SectionTitle, Stat } from '../components/ui'
import { ProfilePictureUpload } from '../components/ProfilePictureUpload'
import { ReminderSyncCard } from '../components/ReminderSyncCard'
import { api, ApiError } from '../lib/api'
import { localDateString } from '../lib/time'
import { getTheme } from '../lib/themes'
import type { LedgerEntry, Profile, Routine } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useTheme } from '../state/ThemeContext'
import { useToast } from '../state/ToastContext'

export function ProfilePage() {
  const { profile, applyProfile } = useAuth()
  const { setTheme } = useTheme()
  const { push } = useToast()

  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [usernameModal, setUsernameModal] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ledgerRows, routineRows] = await Promise.all([
        api.get<LedgerEntry[]>('/me/ledger?limit=12'),
        api.get<Routine[]>(`/routines?local_date=${localDateString()}`),
      ])
      setLedger(ledgerRows)
      setRoutines(routineRows)
    } catch {
      /* non critical */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!usernameModal) {
      setNewUsername('')
      setNameError(null)
      setUsernameAvailable(null)
      setCheckingUsername(false)
      return
    }

    const candidate = newUsername.trim()
    setUsernameAvailable(null)
    setCheckingUsername(false)
    if (
      !/^[A-Za-z0-9_.]{3,20}$/.test(candidate) ||
      candidate === profile?.username
    ) {
      return
    }

    let cancelled = false
    setCheckingUsername(true)
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.public<{ available: boolean }>(
          `/usernames/available?username=${encodeURIComponent(candidate)}`,
        )
        if (!cancelled) setUsernameAvailable(result.available)
      } catch {
        if (!cancelled) setUsernameAvailable(null)
      } finally {
        if (!cancelled) setCheckingUsername(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [newUsername, usernameModal, profile?.username])

  if (!profile) return null

  const theme = getTheme(profile.theme_slug)
  const isFirstUsername = profile.username === null

  const handleUsernameChange = async (event: React.FormEvent) => {
    event.preventDefault()
    setNameError(null)

    const candidate = newUsername.trim()
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(candidate)) {
      setNameError('3–20 characters: letters, numbers, dot or underscore.')
      return
    }
    if (candidate === profile.username) {
      setNameError('That is already your username.')
      return
    }
    if (usernameAvailable === false) {
      setNameError('That username is already taken.')
      return
    }

    setSavingName(true)
    try {
      const updated = await api.post<Profile>('/me/username', { username: candidate })
      const didChange = updated.username !== profile.username
      applyProfile(updated)
      setUsernameModal(false)
      setNewUsername('')
      if (didChange) {
        push(
          isFirstUsername ? `@${updated.username} is yours.` : `Username changed — 400 coins spent.`,
          'success',
        )
      } else {
        push('That is already your username.', 'info')
      }
    } catch (error) {
      setNameError(error instanceof ApiError ? error.detail : 'Could not change your username.')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle title="Profile" subtitle="Your identity, your cosmetics, your coin history." />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar slug={profile.avatar_slug} size={72} src={profile.avatar_url} />
            <div className="min-w-0">
              <h2 className="text-3xl tracking-tight">
                {profile.username ? `@${profile.username}` : 'No username yet'}
              </h2>
              <p className="text-sm text-muted">{profile.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{theme.name} theme</Badge>
                <Badge tone="neutral">{profile.elo} ELO</Badge>
              </div>
            </div>
            <div className="ml-auto">
              <CoinPill coins={profile.coins} />
            </div>
          </div>

          <p className="text-sm text-muted">
            Your rank, tier and position are shown on the ladder page. This page is for your identity and history.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setUsernameModal(true)}>
              {isFirstUsername ? 'Claim username (free)' : 'Change username · 400 coins'}
            </Button>
            <Link to="/shop">
              <Button variant="secondary">Change theme</Button>
            </Link>
            <ProfilePictureUpload />
            <Link to="/leaderboard">
              <Button variant="ghost">View ladder</Button>
            </Link>
            {profile.theme_slug !== 'dark' ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  const updated = await api.post<Profile>('/shop/dark/equip')
                  applyProfile(updated)
                  setTheme('dark')
                }}
              >
                Back to Midnight
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted">
            Usernames are free once; later changes cost 400 coins and only work if the name is not taken.
            Profile picture changes cost 100 coins.
          </p>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-muted">Career stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="ELO" value={profile.elo} />
            <Stat label="Coins" value={profile.coins.toLocaleString()} />
            <Stat label="Perfect routines" value={profile.routines_completed} />
            <Stat label="Tasks done" value={profile.tasks_completed} />
            <Stat label="Best streak" value={`${profile.best_streak} days`} />
            <Stat label="Streak" value={`${profile.streak} days`} hint={`best ${profile.best_streak}`} />
          </div>
        </Card>
      </div>

      <ReminderSyncCard routines={routines} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Recent coin activity" subtitle="Every coin movement, audited." />
          <ul className="space-y-2">
            {ledger.map((entry) => (
              <li key={entry.id} className="glass-2 flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="truncate text-muted">{entry.reason}</span>
                <span className="flex shrink-0 items-center gap-2 font-bold">
                  {entry.delta !== 0 ? (
                    <span className={entry.delta > 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta} coins
                    </span>
                  ) : null}
                  {entry.elo_delta !== 0 ? (
                    <span className={entry.elo_delta > 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {entry.elo_delta > 0 ? '+' : ''}
                      {entry.elo_delta} ELO
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
            {ledger.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">No activity yet.</li> : null}
          </ul>
        </Card>

        <Card>
          <SectionTitle title="How ELO works" subtitle="Your check-in time is the score." />
          <ul className="space-y-2 text-sm text-muted">
            <li>Inside the 20 minute window: +30 to +50 ELO. Each minute off costs 1.</li>
            <li>Outside the window: every minute off costs 2 ELO (30 minutes late is -60).</li>
            <li>On-time check-ins also earn coins. Late check-ins earn none.</li>
            <li>Un-ticking a task reverses both its coins and its ELO.</li>
          </ul>
        </Card>
      </div>

      <Modal
        open={usernameModal}
        onClose={() => setUsernameModal(false)}
        title={isFirstUsername ? 'Claim your username' : 'Change username'}
      >
        <form onSubmit={handleUsernameChange} className="space-y-4">
          <p className="text-sm text-muted">
            {isFirstUsername
              ? 'First pick is free and permanent-ish — later changes cost 400 coins.'
              : `This costs 400 coins. You have ${profile.coins}. Names already taken can not be used.`}
          </p>
          <Field
            label="New username"
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value.replace(/\s/g, ''))}
            error={nameError}
            maxLength={20}
            autoFocus
          />
          {!nameError && newUsername.trim() !== profile.username ? (
            <p
              className={[
                'text-xs font-medium',
                usernameAvailable === false
                  ? 'text-rose-300'
                  : usernameAvailable === true
                    ? 'text-emerald-300'
                    : 'text-muted',
              ].join(' ')}
            >
              {checkingUsername
                ? 'Checking availability…'
                : usernameAvailable === false
                  ? 'That username is already taken.'
                  : usernameAvailable === true
                    ? 'That username is available.'
                    : ''}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setUsernameModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={savingName}
              disabled={!newUsername.trim() || usernameAvailable === false || newUsername.trim() === profile.username}
            >
              {isFirstUsername ? 'Claim it' : 'Pay 400 coins and change'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
