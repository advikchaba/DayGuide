import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar, Badge, Button, Card, EmptyState, Modal, ProgressBar, RankBadge, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import type { Match, MatchTask, ProofVerification, Routine } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

/**
 * Ranked screen: queue for a head-to-head checklist race, photo-verify every
 * item, first to finish takes the ELO.
 */
export function RankedPage() {
  const { profile, refresh } = useAuth()
  const { push } = useToast()

  const [match, setMatch] = useState<Match | null>(null)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedRoutine, setSelectedRoutine] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [queuing, setQueuing] = useState(false)
  const [joining, setJoining] = useState(false)
  const [code, setCode] = useState('')
  const [uploadingTask, setUploadingTask] = useState<number | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [verification, setVerification] = useState<{ provider: string; automatic: boolean } | null>(null)
  const [resultModal, setResultModal] = useState<{ title: string; body: string; tone: 'win' | 'loss' | 'info' } | null>(null)

  const matchRef = useRef<Match | null>(null)
  matchRef.current = match

  const load = useCallback(async () => {
    try {
      const [active, routineList] = await Promise.all([
        api.get<Match | null>('/ranked/active'),
        api.get<Routine[]>('/routines'),
      ])
      setMatch(active)
      setRoutines(routineList)
      setSelectedRoutine((current) => current ?? routineList[0]?.id ?? null)
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not load ranked mode.', 'error')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    void load()
    api
      .get<{ provider: string; automatic: boolean }>('/ranked/verification')
      .then(setVerification)
      .catch(() => setVerification(null))
  }, [load])

  // Poll while a race is open so the opponent's progress shows up live.
  useEffect(() => {
    if (!match || match.status === 'finished') return
    const id = window.setInterval(async () => {
      try {
        const fresh = await api.get<Match>(`/ranked/matches/${match.id}`)
        const previous = matchRef.current
        setMatch(fresh)
        if (fresh.status === 'finished' && previous?.status !== 'finished') {
          setResultOpen(true)
          setResultModal({
            title: fresh.you_won ? 'Race won! 🏆' : 'Race lost',
            body: fresh.you_won
              ? '+50 ELO and +200 coins are in your account.'
              : 'Your opponent finished first. Queue again and take the ELO back.',
            tone: fresh.you_won ? 'win' : 'loss',
          })
          await refresh()
        }
      } catch {
        /* transient - keep polling */
      }
    }, 4000)
    return () => window.clearInterval(id)
  }, [match, refresh])

  const handleQueue = async () => {
    setQueuing(true)
    try {
      const created = await api.post<Match>('/ranked/queue', { routine_id: selectedRoutine })
      setMatch(created)
      if (created.status === 'waiting') {
        push('Race opened. Share the code or wait for an opponent.', 'info')
      } else {
        push('Opponent found — go go go!', 'success')
      }
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not enter ranked.', 'error')
    } finally {
      setQueuing(false)
    }
  }

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!code.trim()) return
    setJoining(true)
    try {
      const joined = await api.post<Match>('/ranked/join', { code: code.trim().toUpperCase() })
      setMatch(joined)
      push('You joined the race. Submit your photos first!', 'success')
      setCode('')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not join that race.', 'error')
    } finally {
      setJoining(false)
    }
  }

  const handleLeave = async () => {
    if (!match) return
    try {
      await api.del(`/ranked/matches/${match.id}`)
      setMatch(null)
      push('Race left.', 'info')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not leave the race.', 'error')
    }
  }

  const handleProof = async (task: MatchTask, file: File) => {
    if (!match) return
    setUploadingTask(task.id)

    const form = new FormData()
    form.append('match_task_id', String(task.id))
    form.append('file', file)

    try {
      const result = await api.upload<ProofVerification>(`/ranked/matches/${match.id}/proof`, form)
      if (result.match) {
        setMatch(result.match)
        // The race can end on our own final upload - show the result immediately.
        if (result.match.status === 'finished') {
          setResultModal({
            title: result.match.you_won ? 'Race won! 🏆' : 'Race lost',
            body: result.match.you_won
              ? '+50 ELO and +200 coins are in your account.'
              : 'Your opponent finished first. Queue again and take the ELO back.',
            tone: result.match.you_won ? 'win' : 'loss',
          })
          setResultOpen(true)
        }
      }

      if (result.approved) {
        push(`Verified: ${task.title} (+${result.coins_awarded} coins)`, 'success')
      } else if (result.proof.status === 'pending') {
        push('Photo queued for human review.', 'info')
      } else {
        push(`Rejected: ${result.proof.reason}`, 'error')
      }
      await refresh()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not upload that photo.', 'error')
    } finally {
      setUploadingTask(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Loading the ladder…
      </div>
    )
  }

  const me = match?.players.find((player) => player.is_you)
  const opponent = match?.players.find((player) => !player.is_you)

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Ranked races"
        subtitle="Same checklist, two players, first to get every item verified wins the ELO."
        action={<RankBadge rank={profile?.rank ?? { name: 'Copper', color: '#C87F52' }} elo={profile?.elo} />}
      />

      {!match ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="space-y-4">
            <h3 className="text-lg font-bold">Start a race</h3>
            <p className="text-sm text-muted">
              Pick which of your routines becomes the race checklist. We match you with a player close to your ELO, or you
              can open a private race and share the code.
            </p>

            {routines.length === 0 ? (
              <EmptyState
                icon="📋"
                title="No routine to race with"
                body="Build a routine first — it becomes the checklist you both have to photograph."
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {routines.map((routine) => (
                    <button
                      key={routine.id}
                      type="button"
                      onClick={() => setSelectedRoutine(routine.id)}
                      className={[
                        'focus-ring rounded-xl border px-3 py-2 text-sm font-semibold transition',
                        routine.id === selectedRoutine
                          ? 'border-accent/60 bg-accent/15'
                          : 'border-line bg-surface-2/50 text-muted hover:text-ink',
                      ].join(' ')}
                    >
                      {routine.emoji} {routine.name}
                      <span className="ml-2 text-xs text-muted">{routine.total} items</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="lg" loading={queuing} onClick={handleQueue}>
                    Find me an opponent
                  </Button>
                </div>

                <div className="rounded-xl border border-line bg-surface-2/50 p-3 text-xs text-muted">
                  Rewards: first to finish gets <span className="font-bold text-ink">+{50} ELO</span> and{' '}
                  <span className="font-bold text-ink">+200 coins</span>. Not finishing costs you 15 ELO.
                </div>
              </>
            )}
          </Card>

          <Card className="space-y-4">
            <h3 className="text-lg font-bold">Join with a code</h3>
            <p className="text-sm text-muted">Got a code from a friend? Drop it in here.</p>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="focus-ring w-full rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-center text-lg font-black tracking-[0.4em]"
              />
              <Button type="submit" variant="secondary" full loading={joining} disabled={!code.trim()}>
                Join race
              </Button>
            </form>

            <div className="rounded-xl border border-line bg-surface-2/50 p-3 text-xs text-muted">
              Verification: {verification ? `${verification.provider}${verification.automatic ? ' (automatic)' : ''}` : 'loading…'}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Scoreboard */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Race {match.code}</p>
                <h3 className="text-lg font-bold">{match.routine_name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={match.status === 'active' ? 'success' : match.status === 'waiting' ? 'gold' : 'neutral'}>
                  {match.status}
                </Badge>
                {match.status === 'finished' ? (
                  <Button size="sm" onClick={() => setResultOpen(true)}>
                    View result
                  </Button>
                ) : null}
                <Button size="sm" variant="danger" onClick={handleLeave}>
                  {match.status === 'active' ? 'Forfeit' : 'Cancel'}
                </Button>
              </div>
            </div>

            {match.status === 'waiting' ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm">
                <Spinner className="h-4 w-4" />
                <span>
                  Waiting for an opponent. Share code{' '}
                  <span className="rounded-lg bg-black/30 px-2 py-0.5 font-mono text-base font-bold tracking-widest">
                    {match.code}
                  </span>{' '}
                  to start instantly.
                </span>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[me, opponent].filter(Boolean).map((player) => (
                  <div
                    key={player!.user_id}
                    className={[
                      'glass-2 p-4',
                      player!.is_you ? 'border-accent/50' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar slug={player!.avatar_slug} size={42} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {player!.is_you ? 'You' : `@${player!.username ?? 'opponent'}`}
                        </p>
                        <p className="text-xs text-muted">
                          {player!.rank_name} · {player!.elo} ELO
                          {player!.elo_delta ? ` (${player!.elo_delta > 0 ? '+' : ''}${player!.elo_delta})` : ''}
                        </p>
                      </div>
                      {player!.finished ? <Badge tone="success">finished</Badge> : null}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar value={(player!.progress / Math.max(1, player!.total)) * 100} />
                      <span className="whitespace-nowrap text-xs font-bold text-muted">
                        {player!.progress}/{player!.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Checklist */}
          <Card>
            <SectionTitle
              title="Race checklist"
              subtitle="Photograph each item. Only verified photos count towards the win."
            />
            <ul className="space-y-2.5">
              {match.tasks.map((task) => (
                <RaceTaskRow
                  key={task.id}
                  task={task}
                  disabled={match.status !== 'active'}
                  uploading={uploadingTask === task.id}
                  onProof={handleProof}
                />
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Modal open={resultOpen} onClose={() => setResultOpen(false)} width="max-w-md">
        <div className="text-center">
          <div className="mb-3 text-5xl" aria-hidden>
            {resultModal?.tone === 'win' ? '🏆' : '🥈'}
          </div>
          <h3 className="text-xl font-extrabold">{resultModal?.title ?? 'Race finished'}</h3>
          <p className="mt-2 text-sm text-muted">{resultModal?.body}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              onClick={() => {
                setResultOpen(false)
                setMatch(null)
                void load()
              }}
            >
              Queue again
            </Button>
            <Button variant="ghost" onClick={() => setResultOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function RaceTaskRow({
  task,
  disabled,
  uploading,
  onProof,
}: {
  task: MatchTask
  disabled: boolean
  uploading: boolean
  onProof: (task: MatchTask, file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPreview(URL.createObjectURL(file))
    await onProof(task, file)
  }

  const rejected = task.proof_status === 'rejected'
  const pending = task.proof_status === 'pending'

  return (
    <li
      className={[
        'flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 transition',
        task.approved ? 'border-emerald-400/40 bg-emerald-500/[0.08]' : 'border-line bg-surface-2/50',
      ].join(' ')}
    >
      <span
        className={[
          'grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 text-sm font-black',
          task.approved ? 'border-emerald-400 bg-emerald-400 text-emerald-950' : 'border-line text-muted',
        ].join(' ')}
      >
        {task.approved ? '✓' : '•'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {task.approved ? <Badge tone="success">verified</Badge> : null}
          {pending ? <Badge tone="gold">in review</Badge> : null}
          {rejected ? <Badge tone="danger">rejected — try again</Badge> : null}
          {!task.proof_status && !task.approved ? <Badge tone="neutral">photo needed</Badge> : null}
        </div>
      </div>

      {preview ? (
        <img src={preview} alt="Your proof" className="h-12 w-12 rounded-xl border border-line object-cover" />
      ) : null}

      <Button
        size="sm"
        variant={task.approved ? 'ghost' : 'primary'}
        disabled={disabled || task.approved}
        loading={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {task.approved ? 'Done' : rejected ? 'Retry' : 'Upload proof'}
      </Button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
    </li>
  )
}
