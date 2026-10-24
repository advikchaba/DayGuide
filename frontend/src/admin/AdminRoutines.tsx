import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  SectionTitle,
} from '../components/ui'
import { api, ApiError } from '../lib/api'
import { nextFreeSlot } from '../lib/time'
import type { Routine, Task } from '../lib/types'
import { useToast } from '../state/ToastContext'

function TaskEditor({
  userId,
  task,
  index,
  onChanged,
}: {
  userId: string
  task: Task
  index: number
  onChanged: () => Promise<void>
}) {
  const { push } = useToast()
  const [title, setTitle] = useState(task.title)
  const [scheduledTime, setScheduledTime] = useState(task.scheduled_time)
  const [coinValue, setCoinValue] = useState(String(task.coin_value))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setScheduledTime(task.scheduled_time)
    setCoinValue(String(task.coin_value))
  }, [task.id, task.title, task.scheduled_time, task.coin_value])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    const coins = Number(coinValue)
    if (!title.trim()) {
      push('A task needs a title.', 'error')
      return
    }
    if (!Number.isInteger(coins) || coins < 0 || coins > 200) {
      push('Task coins must be a whole number from 0 to 200.', 'error')
      return
    }
    setBusy(true)
    try {
      await api.patch(`/admin/users/${userId}/tasks/${task.id}`, {
        title: title.trim(),
        note: task.note,
        requires_proof: task.requires_proof,
        scheduled_time: scheduledTime,
        coin_value: coins,
      })
      push(`Task “${title.trim()}” saved.`, 'success')
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not save that task.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      await api.del(`/admin/users/${userId}/tasks/${task.id}`)
      push(`Task “${task.title}” removed.`, 'success')
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not remove that task.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="glass-2 space-y-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Task {index + 1}</span>
        <Button type="button" variant="danger" size="sm" onClick={handleRemove} loading={busy}>
          Remove
        </Button>
      </div>
      <Field
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={120}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Scheduled time"
          type="time"
          value={scheduledTime}
          onChange={(event) => setScheduledTime(event.target.value)}
        />
        <Field
          label="Coins"
          hint="0 to 200"
          type="number"
          min={0}
          max={200}
          step={1}
          value={coinValue}
          onChange={(event) => setCoinValue(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm" loading={busy}>
        Save task
      </Button>
    </form>
  )
}

function RoutineCard({
  userId,
  routine,
  allTasks,
  onChanged,
}: {
  userId: string
  routine: Routine
  allTasks: Task[]
  onChanged: () => Promise<void>
}) {
  const { push } = useToast()
  const [name, setName] = useState(routine.name)
  const [savingName, setSavingName] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState(nextFreeSlot(allTasks))
  const [newCoins, setNewCoins] = useState('10')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setName(routine.name)
  }, [routine.id, routine.name])

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      push('A routine needs a name.', 'error')
      return
    }
    setSavingName(true)
    try {
      await api.patch(`/admin/users/${userId}/routines/${routine.id}`, {
        name: name.trim(),
      })
      push('Routine name saved.', 'success')
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not rename that routine.', 'error')
    } finally {
      setSavingName(false)
    }
  }

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault()
    const coins = Number(newCoins)
    if (!newTitle.trim()) {
      push('Give the new task a title.', 'error')
      return
    }
    if (!Number.isInteger(coins) || coins < 0 || coins > 200) {
      push('Task coins must be a whole number from 0 to 200.', 'error')
      return
    }
    setAdding(true)
    try {
      await api.post(`/admin/users/${userId}/routines/${routine.id}/tasks`, {
        title: newTitle.trim(),
        scheduled_time: newTime,
        coin_value: coins,
      })
      push('Task added.', 'success')
      setNewTitle('')
      setNewTime(nextFreeSlot([...allTasks, { title: newTitle, scheduled_time: newTime }]))
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not add that task.', 'error')
    } finally {
      setAdding(false)
    }
  }

  const removeRoutine = async () => {
    setDeleting(true)
    try {
      await api.del(`/admin/users/${userId}/routines/${routine.id}`)
      push(`Routine “${routine.name}” deleted.`, 'success')
      setConfirmDelete(false)
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not delete that routine.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{routine.name}</h3>
            <p className="text-xs text-muted">
              {routine.tasks.length} task{routine.tasks.length === 1 ? '' : 's'} ·{' '}
              {routine.percent}% complete today
            </p>
          </div>
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete routine
          </Button>
        </div>

        <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Field label="Routine name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </div>
          <Button type="submit" variant="secondary" size="sm" loading={savingName}>
            Save name
          </Button>
        </form>

        <div className="space-y-3">
          {routine.tasks.length === 0 ? (
            <p className="text-sm text-muted">This routine has no tasks yet.</p>
          ) : (
            routine.tasks.map((task, index) => (
              <TaskEditor
                key={task.id}
                userId={userId}
                task={task}
                index={index}
                onChanged={onChanged}
              />
            ))
          )}
        </div>

        <form onSubmit={addTask} className="glass-2 space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Add a task</span>
            <Badge tone="neutral">30 min spacing</Badge>
          </div>
          <Field
            label="Title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            maxLength={120}
            placeholder="e.g. Review tomorrow's plan"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Scheduled time"
              type="time"
              value={newTime}
              onChange={(event) => setNewTime(event.target.value)}
            />
            <Field
              label="Coins"
              hint="0 to 200"
              type="number"
              min={0}
              max={200}
              step={1}
              value={newCoins}
              onChange={(event) => setNewCoins(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" loading={adding}>
            Add task
          </Button>
        </form>
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this routine?"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={deleting} onClick={removeRoutine}>
              Delete routine
            </Button>
          </>
        }
      >
        <p>
          This permanently removes <strong>{routine.name}</strong> and its tasks from this account.
          Their saved completion history will no longer appear in reports.
        </p>
      </Modal>
    </>
  )
}

export function AdminRoutines({
  userId,
  routines,
  onChanged,
}: {
  userId: string
  routines: Routine[]
  onChanged: () => Promise<void>
}) {
  const allTasks = routines.flatMap((routine) => routine.tasks)

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Routines"
        subtitle="Edit names, tasks, scheduled times and coin values. The 30-minute spacing rule still applies."
      />
      {routines.length === 0 ? (
        <EmptyState
          title="No routines"
          body="This account has no routines. The user can create one from their own app."
        />
      ) : (
        <div className="space-y-4">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              userId={userId}
              routine={routine}
              allTasks={allTasks}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
