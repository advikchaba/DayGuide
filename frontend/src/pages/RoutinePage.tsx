import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TaskRow } from '../components/TaskRow'
import { RewardBurst } from '../components/RewardBurst'
import { ReminderSyncCard } from '../components/ReminderSyncCard'
import { Avatar, Badge, Button, Card, CoinPill, EmptyState, ProgressBar, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import {
  findSpacingConflict,
  localDateString,
  localTimeString,
  nextFreeSlot,
  nextSlot,
  spacingConflictMessage,
} from '../lib/time'
import type { Reward, Routine, Task, TaskCompleteResponse } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

function timingLabel(delta: number): string {
  if (delta === 0) return 'right on schedule'
  return `${delta} min from schedule`
}

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
  const [newTaskTime, setNewTaskTime] = useState(nextSlot())
  const [adding, setAdding] = useState(false)

  const active = useMemo(
    () => routines.find((routine) => routine.id === activeId) ?? routines[0] ?? null,
    [routines, activeId],
  )

  const load = useCallback(async () => {
    try {
      const data = await api.get<Routine[]>(`/routines?local_date=${localDateString()}`)
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
    const wasCompleted = task.completed_today
    setBusyTask(task.id)
    try {
      const result = wasCompleted
        ? await api.del<TaskCompleteResponse>(
            `/tasks/${task.id}/complete?local_date=${localDateString()}`,
          )
        : await api.post<TaskCompleteResponse>(`/tasks/${task.id}/complete`, {
            local_time: localTimeString(),
            local_date: localDateString(),
          })

      replaceRoutine(result.routine)

      if (!wasCompleted) {
        if (result.reward.perfect) {
          setReward(result.reward)
          setRewardOpen(true)
        } else if (result.reward.on_time) {
          push(
            `+${result.reward.coins} coins · +${result.reward.elo} ELO · ${timingLabel(result.reward.time_delta_minutes)}`,
            'coins',
          )
        } else {
          const floorNote =
            result.reward.elo === 0 && result.reward.new_elo <= 100
              ? ' · ELO already at the 100 floor'
              : ''
          push(
            `${timingLabel(result.reward.time_delta_minutes)} · ${result.reward.elo} ELO${floorNote} · no coins`,
            'error',
          )
        }
      } else {
        push('Task unchecked — its coins and ELO were reversed.', 'info')
      }

      await refresh()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not update that task.', 'error')
    } finally {
      setBusyTask(null)
    }
  }

  const handleQuickAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!active || !newTask.trim()) return

    const conflict = findSpacingConflict(
      routines.flatMap((routine) => routine.tasks),
      newTaskTime,
    )
    if (conflict) {
      push(spacingConflictMessage(newTaskTime, conflict), 'error')
      return
    }

    setAdding(true)
    try {
      const updated = await api.post<Routine>(
        `/routines/${active.id}/tasks?local_date=${localDateString()}`,
        {
          title: newTask.trim(),
          scheduled_time: newTaskTime,
          coin_value: 10,
        },
      )
      replaceRoutine(updated)
      setNewTask('')
      setNewTaskTime(
        nextFreeSlot(
          routines
            .map((routine) => (routine.id === updated.id ? updated : routine))
            .flatMap((routine) => routine.tasks),
        ),
      )
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

  return (
    <div className="space-y-6">
      {/* Hero stats */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted">Today</p>
              <h1 className="mt-1 text-3xl tracking-tight">
                Hey {profile?.username ? `@${profile.username}` : 'there'}
              </h1>
              <p className="mt-1 max-w-md text-sm text-muted">
                {doneToday
                  ? 'Every task landed on time. Your perfect-day coins are banked.'
                  : 'Check tasks in near their scheduled time. On time earns coins and up to +50 ELO. More than 20 minutes off costs ELO.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Avatar slug={profile?.avatar_slug} size={52} src={profile?.avatar_url} />
              <div>
                <p className="text-sm font-bold">{profile?.elo ?? 0} ELO</p>
                <p className="mt-1 text-xs text-muted">Your rank lives on the ladder page.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <CoinPill coins={profile?.coins ?? 0} />
            <Badge tone="accent">{profile?.streak ?? 0} day streak</Badge>
            <Badge tone="neutral">{profile?.routines_completed ?? 0} perfect routines</Badge>
            <Badge tone="neutral">{profile?.tasks_completed ?? 0} tasks done</Badge>
          </div>
        </Card>

        {/* Today's progress card */}
        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted">{active?.name ?? 'No routine'}</p>
            <p className="mt-2 text-4xl font-bold">
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
              <Link to="/leaderboard" className="flex-1">
                <Button size="sm" full>
                  View ladder
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <ReminderSyncCard routines={routines} />

      {/* Routine switcher */}
      {routines.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {routines.map((routine) => (
            <button
              key={routine.id}
              type="button"
              onClick={() => setActiveId(routine.id)}
              className={[
                'focus-ring rounded-lg px-3 py-2 text-sm font-bold transition',
                routine.id === active?.id ? 'bg-surface-2 text-ink' : 'bg-surface text-muted hover:text-ink',
              ].join(' ')}
            >
              {routine.name}
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
            title={active.name}
            subtitle="Tap a task when you do it. The closer to its scheduled time, the bigger the reward."
            action={
              active.perfect_today ? (
                <Badge tone="success">Perfect today</Badge>
              ) : (
                <Badge tone="neutral">{active.total - active.done} left</Badge>
              )
            }
          />

          <ul className="space-y-2.5">
            {active.tasks.map((task) => (
              <div key={task.id} className="group relative">
                <TaskRow task={task} busy={busyTask === task.id} onToggle={handleToggle} />
                <button
                  type="button"
                  onClick={() => handleDeleteTask(task)}
                  className="focus-ring absolute -top-1.5 right-2 hidden rounded-md bg-surface-solid px-2 py-0.5 text-[10px] font-bold text-muted transition hover:text-rose-300 group-hover:block"
                  title="Remove task"
                >
                  remove
                </button>
              </div>
            ))}
          </ul>

          <form onSubmit={handleQuickAdd} className="mt-3 flex flex-wrap gap-2">
            <input
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              placeholder="Add another task to this routine…"
              maxLength={120}
              className="focus-ring min-w-[200px] flex-1 rounded-lg bg-surface-2 px-4 py-2.5 text-sm"
            />
            <input
              type="time"
              value={newTaskTime}
              onChange={(event) => setNewTaskTime(event.target.value)}
              required
              aria-label="Scheduled time"
              className="focus-ring rounded-lg bg-surface-2 px-3 py-2.5 text-sm"
            />
            <Button type="submit" variant="secondary" loading={adding} disabled={!newTask.trim()}>
              Add
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Tasks need at least 30 minutes between scheduled times, across all of your routines.
          </p>
        </section>
      ) : (
        <EmptyState
          title="No routine yet"
          body="Start with a name, a few tasks, and the times you want to do them. You can add more later."
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
