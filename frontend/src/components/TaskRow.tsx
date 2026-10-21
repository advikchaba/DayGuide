import { Badge } from './ui'
import type { Task } from '../lib/types'
import { formatTime } from '../lib/time'

interface TaskRowProps {
  task: Task
  busy: boolean
  onToggle: (task: Task) => void
}

export function TaskRow({ task, busy, onToggle }: TaskRowProps) {
  return (
    <li
      className={[
        'group flex items-start gap-3 rounded-lg p-3.5 transition',
        task.completed_today ? 'bg-emerald-500/10' : 'bg-surface-2 hover:brightness-105',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-pressed={task.completed_today}
        aria-label={task.completed_today ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        className={[
          'focus-ring mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-black transition',
          task.completed_today
            ? 'bg-emerald-400 text-emerald-950'
            : 'bg-surface-solid text-transparent hover:text-muted',
          busy ? 'opacity-60' : '',
        ].join(' ')}
      >
        ✓
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
        </div>
      </div>
    </li>
  )
}
