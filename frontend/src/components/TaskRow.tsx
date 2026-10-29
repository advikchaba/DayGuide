import { Badge } from './ui'
import type { Task } from '../lib/types'
import { formatTime } from '../lib/time'

interface TaskRowProps {
  task: Task
  busy: boolean
  locked?: boolean
  lockReason?: string
  onToggle: (task: Task) => void
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden fill="currentColor">
      <path d="M7 10V7a5 5 0 0 1 10 0v3h1.2c.99 0 1.8.81 1.8 1.8v7.4c0 .99-.81 1.8-1.8 1.8H5.8c-.99 0-1.8-.81-1.8-1.8v-7.4C4 11.81 4.81 11 5.8 11H7Zm2 0h6V7a3 3 0 1 0-6 0v3Zm3 3a1.5 1.5 0 0 0-.75 2.8V18h1.5v-2.2A1.5 1.5 0 0 0 12 13Z" />
    </svg>
  )
}

export function TaskRow({ task, busy, locked = false, lockReason, onToggle }: TaskRowProps) {
  return (
    <li
      className={[
        'group flex items-start gap-3 rounded-lg p-3.5 transition',
        task.completed_today
          ? 'bg-emerald-500/10'
          : locked
            ? 'bg-surface-2/70 opacity-75'
            : 'bg-surface-2 hover:brightness-105',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={busy || locked}
        aria-pressed={task.completed_today}
        aria-disabled={locked || undefined}
        aria-label={
          locked
            ? `${task.title} is locked until ${lockReason ?? 'the previous task'} is complete`
            : task.completed_today
              ? `Mark ${task.title} as not done`
              : `Mark ${task.title} as done`
        }
        title={locked ? `Finish “${lockReason ?? 'the previous task'}” first` : undefined}
        className={[
          'focus-ring mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-black transition',
          task.completed_today
            ? 'bg-emerald-400 text-emerald-950'
            : locked
              ? 'cursor-not-allowed bg-surface-solid text-muted'
              : 'bg-surface-solid text-transparent hover:text-muted',
          busy ? 'opacity-60' : '',
        ].join(' ')}
      >
        {locked ? <LockIcon /> : '✓'}
      </button>

      <div className="min-w-0 flex-1">
        <p className={['text-sm font-bold', task.completed_today ? 'line-through decoration-emerald-400/70' : ''].join(' ')}>
          {task.title}
        </p>

        {task.note ? <p className="mt-0.5 text-xs text-muted">{task.note}</p> : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="accent">Scheduled {formatTime(task.scheduled_time)}</Badge>
          <Badge tone="gold">+{task.coin_value} coins on time</Badge>
          {task.completed_today ? <Badge tone="success">Checked in today</Badge> : null}
          {locked ? <Badge tone="neutral">Locked</Badge> : null}
        </div>

        {locked ? (
          <p className="mt-2 text-xs font-medium text-amber-200/80">
            Finish “{lockReason ?? 'the previous task'}” first. Tasks unlock in scheduled order.
          </p>
        ) : null}
      </div>
    </li>
  )
}
