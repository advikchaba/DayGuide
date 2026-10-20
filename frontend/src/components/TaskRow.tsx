import { useRef, useState } from 'react'
import { Badge, Button } from './ui'
import type { Task } from '../lib/types'

interface TaskRowProps {
  task: Task
  busy: boolean
  onToggle: (task: Task) => void
  onProof: (task: Task, file: File) => Promise<void>
}

const PROOF_BADGES: Record<string, { tone: 'success' | 'danger' | 'gold'; label: string }> = {
  approved: { tone: 'success', label: 'photo verified' },
  rejected: { tone: 'danger', label: 'photo rejected' },
  pending: { tone: 'gold', label: 'photo in review' },
}

export function TaskRow({ task, busy, onToggle, onProof }: TaskRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const proofBadge = task.proof_status ? PROOF_BADGES[task.proof_status] : undefined

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await onProof(task, file)
    } finally {
      setUploading(false)
    }
  }

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
        disabled={busy || uploading}
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
          <Badge tone="gold">+{task.coin_value} coins</Badge>
          {task.requires_proof ? <Badge tone="accent">Proof required</Badge> : null}
          {proofBadge ? <Badge tone={proofBadge.tone}>{proofBadge.label}</Badge> : null}
        </div>
      </div>

      <div className="shrink-0">
        <Button
          variant={task.requires_proof && !task.completed_today ? 'primary' : 'secondary'}
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {task.proof_status === 'rejected' ? 'Retry photo' : 'Add photo'}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      </div>
    </li>
  )
}
