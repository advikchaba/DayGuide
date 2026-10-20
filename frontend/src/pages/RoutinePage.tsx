import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TaskRow } from '../components/TaskRow'
import { RewardBurst } from '../components/RewardBurst'
import { Avatar, Badge, Button, Card, CoinPill, EmptyState, ProgressBar, RankBadge, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { prepareProofPhoto } from '../lib/images'
import { RANK_TIERS, type ProofVerification, type Reward, type Routine, type Task, type TaskCompleteResponse } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export function RoutinePage() {
  const { profile, refresh } = useAuth()
  const { push } = useToast()

  const [routines, setRoutines] = useState<Routine[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyTask, setBusyTask] = useState<number | null>(null)
  const [reward, setReward] = useState<Reward | null>(null)
  const [rewardOpen, setRewardOpen] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)

  const active = useMemo(
    () => routines.find((routine) => routine.id === activeId) ?? routines[0] ?? null,
    [routines, activeId],
  )

  const load = useCallback(async () => {
    try {
      const data = await api.get<Routine[]>('/routines')
      setRoutines(data)
      setActiveId((current) => current ?? data[0]?.id ?? null)
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not load your routines.', 'error')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  const replaceRoutine = (next: Routine) => {
    setRoutines((current) => current.map((routine) => (routine.id === next.id ? next : routine)))
  }

  const handleToggle = async (task: Task) => {
    setBusyTask(task.id)
    try {
      const result = task.completed_today
        ? await api.del<TaskCompleteResponse>(`/tasks/${task.id}/complete`)
        : await api.post<TaskCompleteResponse>(`/tasks/${task.id}/complete`)

      replaceRoutine(result.routine)

      const coins = result.reward.coins
      if (result.reward.perfect || coins < 0) {
        setReward(result.reward)
        setRewardOpen(true)
      } else if (coins > 0) {
        push(`+${coins} coins and +${result.reward.elo} ELO`, 'coins')
      }
      await refresh()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not update that task.', 'error')
    } finally {
      setBusyTask(null)
    }
  }

  const handleProof = async (task: Task, file: File) => {
    const form = new FormData()
    form.append('file', await prepareProofPhoto(file))

    try {
      const result = await api.upload<ProofVerification>(`/tasks/${task.id}/proof`, form)
      if (result.routine) replaceRoutine(result.routine)

      if (result.approved) {
        setReward(result.reward)
        setRewardOpen(true)
      } else if (result.proof.status === 'pending') {
        push('Photo received — it is queued for human review.', 'info')
      } else {
        push(`Photo rejected: ${result.proof.reason}`, 'error')
      }
      await refresh()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not upload that photo.', 'error')
    }
  }

  const handleQuickAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!active || !newTask.trim()) return

    setAdding(true)
    try {
      const updated = await api.post<Routine>(`/routines/${active.id}/tasks`, {
        title: newTask.trim(),
        requires_proof: false,
        coin_value: 10,
      })
      replaceRoutine(updated)
      setNewTask('')
      push('Task added to today’s checklist.', 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not add that task.', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteTask = async (task: Task) => {
    try {
      await api.del(`/tasks/${task.id}`)
      await load()
      push('Task removed.', 'info')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not remove that task.', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Loading your checklist…
      </div>
    )
  }

  const doneToday = active?.perfect_today ?? false
  const nextTier = RANK_TIERS.find((tier) => tier.min_elo > (profile?.elo ?? 0))

  return (
    <div className="space-y-6">
      {/* Hero stats */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="relative overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Today</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Hey {profile?.username ? `@${profile.username}` : 'there'} 👋
              </h1>
              <p className="mt-1 max-w-md text-sm text-muted">
                {doneToday
                  ? 'Routine complete — you already banked the coins and the ELO today.'
                  : 'Tick everything off to bank 200 coins and +50 ELO.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Avatar slug={profile?.avatar_slug} size={52} />
              <div>
                <RankBadge rank={profile?.rank ?? RANK_TIERS[0]} elo={profile?.elo} />
                <p className="mt-1.5 text-xs text-muted">
                  {nextTier ? `${nextTier.min_elo - (profile?.elo ?? 0)} ELO to ${nextTier.name}` : 'Top tier reached'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>{profile?.rank.name} progress</span>
              <span>{Math.round((profile?.rank.progress ?? 0) * 100)}%</span>
            </div>
            <ProgressBar value={(profile?.rank.progress ?? 0) * 100} color={profile?.rank.color} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <CoinPill coins={profile?.coins ?? 0} />
            <Badge tone="accent">🔥 {profile?.streak ?? 0} day streak</Badge>
            <Badge tone="neutral">🏅 {profile?.matches_won ?? 0} race wins</Badge>
            <Badge tone="neutral">✅ {profile?.routines_completed ?? 0} perfect routines</Badge>
          </div>
        </Card>

        {/* Today's progress ring-ish card */}
        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">{active?.name ?? 'No routine'}</p>
            <p className="mt-2 text-4xl font-black">
              {active?.done ?? 0}
              <span className="text-xl text-muted">/{active?.total ?? 0}</span>
            </p>
            <p className="text-sm text-muted">tasks done today</p>
          </div>

          <div className="mt-4 space-y-3">
            <ProgressBar value={active?.percent ?? 0} />
            <div className="flex gap-2">
              <Link to="/routines/new" className="flex-1">
                <Button variant="secondary" size="sm" full>
                  New routine
                </Button>
              </Link>
              <Link to="/ranked" className="flex-1">
                <Button size="sm" full>
                  Race now
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* Routine switcher */}
      {routines.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {routines.map((routine) => (
            <button
              key={routine.id}
              type="button"
              onClick={() => setActiveId(routine.id)}
              className={[
                'focus-ring rounded-xl border px-3 py-2 text-sm font-semibold transition',
                routine.id === active?.id
                  ? 'border-accent/60 bg-accent/15 text-ink'
                  : 'border-line bg-surface-2/50 text-muted hover:text-ink',
              ].join(' ')}
            >
              {routine.emoji} {routine.name}
              <span className="ml-2 text-xs text-muted">
                {routine.done}/{routine.total}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Checklist */}
      {active ? (
        <section>
          <SectionTitle
            title={`${active.emoji} ${active.name}`}
            subtitle="Tap the circle to complete a task, or attach a photo for proof bonuses."
            action={
              active.perfect_today ? (
                <Badge tone="success">Perfect today 🎉</Badge>
              ) : (
                <Badge tone="neutral">{active.total - active.done} left</Badge>
              )
            }
          />

          <ul className="space-y-2.5">
            {active.tasks.map((task) => (
              <div key={task.id} className="relative">
                <TaskRow task={task} busy={busyTask === task.id} onToggle={handleToggle} onProof={handleProof} />
                <button
                  type="button"
                  onClick={() => handleDeleteTask(task)}
                  className="focus-ring absolute -top-1.5 right-2 hidden rounded-lg border border-line bg-bg px-2 py-0.5 text-[10px] font-semibold text-muted transition hover:text-rose-300 group-hover:block"
                  title="Remove task"
                >
                  remove
                </button>
              </div>
            ))}
          </ul>

          <form onSubmit={handleQuickAdd} className="mt-3 flex gap-2">
            <input
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              placeholder="Add another task to this routine…"
              maxLength={120}
              className="focus-ring flex-1 rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 text-sm"
            />
            <Button type="submit" variant="secondary" loading={adding} disabled={!newTask.trim()}>
              Add
            </Button>
          </form>
        </section>
      ) : (
        <EmptyState
          icon="📋"
          title="No routine yet"
          body="Create your first routine — a handful of tasks you want to do every single day."
          action={
            <Link to="/routines/new">
              <Button>Create a routine</Button>
            </Link>
          }
        />
      )}

      <RewardBurst reward={reward} open={rewardOpen} onClose={() => setRewardOpen(false)} />
    </div>
  )
}
