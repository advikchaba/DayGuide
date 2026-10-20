import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Field, SectionTitle } from '../components/ui'
import { api, ApiError } from '../lib/api'
import type { Routine } from '../lib/types'
import { useToast } from '../state/ToastContext'

interface DraftTask {
  key: number
  title: string
  requires_proof: boolean
  coin_value: number
}

const TEMPLATES: { name: string; tasks: string[] }[] = [
  { name: 'Morning Routine', tasks: ['Wake up on time', 'Drink a glass of water', 'Make the bed', 'Stretch for 5 minutes'] },
  { name: 'Gym Day', tasks: ['Warm up 10 minutes', 'Complete the workout', 'Cool down and stretch', 'Log the session'] },
  { name: 'Deep Study', tasks: ['Phone in another room', 'Study block 1 (45 min)', 'Study block 2 (45 min)', 'Review notes'] },
  { name: 'Wind Down', tasks: ['No screens after 22:00', 'Tidy the desk', 'Read 10 pages', 'Lights out by 23:00'] },
]

let keySeed = 1

export function RoutineBuilderPage() {
  const navigate = useNavigate()
  const { push } = useToast()

  const [name, setName] = useState('My Routine')
  const [tasks, setTasks] = useState<DraftTask[]>([
    { key: keySeed++, title: '', requires_proof: false, coin_value: 10 },
  ])
  const [saving, setSaving] = useState(false)

  const updateTask = (key: number, patch: Partial<DraftTask>) => {
    setTasks((current) => current.map((task) => (task.key === key ? { ...task, ...patch } : task)))
  }

  const addTask = () => setTasks((current) => [...current, { key: keySeed++, title: '', requires_proof: false, coin_value: 10 }])

  const removeTask = (key: number) => setTasks((current) => current.filter((task) => task.key !== key))

  const applyTemplate = (index: number) => {
    const template = TEMPLATES[index]
    setName(template.name)
    setTasks(template.tasks.map((title) => ({ key: keySeed++, title, requires_proof: false, coin_value: 10 })))
  }

  const totalCoins = tasks.reduce((sum, task) => (task.title.trim() ? sum + task.coin_value : sum), 0)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleaned = tasks.filter((task) => task.title.trim())

    if (!name.trim()) {
      push('Give your routine a name.', 'error')
      return
    }
    if (cleaned.length === 0) {
      push('Add at least one task.', 'error')
      return
    }

    setSaving(true)
    try {
      await api.post<Routine>('/routines', {
        name: name.trim(),
        emoji: '',
        tasks: cleaned.map((task) => ({
          title: task.title.trim(),
          requires_proof: task.requires_proof,
          coin_value: task.coin_value,
        })),
      })
      push('Routine created. Go finish it.', 'success')
      navigate('/app')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not save that routine.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionTitle
        title="Build a routine"
        subtitle="Tasks you do every day. Mark the ones that need photo proof for bigger rewards."
        action={
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        }
      />

      <Card className="space-y-5">
        <Field label="Routine name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />

        <div>
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Start from a template</span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((template, index) => (
              <Button key={template.name} type="button" variant="secondary" size="sm" onClick={() => applyTemplate(index)}>
                {template.name}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Tasks" subtitle={`${tasks.filter((t) => t.title.trim()).length} task(s) · ${totalCoins} coins per full day`} />

        <ul className="space-y-3">
          {tasks.map((task, index) => (
            <li key={task.key} className="glass-2 flex flex-wrap items-center gap-3 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2 text-xs font-bold text-muted">
                {index + 1}
              </span>

              <input
                value={task.title}
                onChange={(event) => updateTask(task.key, { title: event.target.value })}
                placeholder="e.g. Drink a glass of water"
                maxLength={120}
                className="focus-ring min-w-[180px] flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
              />

              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-muted">
                <input
                  type="checkbox"
                  checked={task.requires_proof}
                  onChange={(event) => updateTask(task.key, { requires_proof: event.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Proof
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-muted">
                Coins
                <select
                  value={task.coin_value}
                  onChange={(event) => updateTask(task.key, { coin_value: Number(event.target.value) })}
                  className="focus-ring rounded-md bg-surface-2 px-2 py-1.5 text-xs"
                >
                  {[10, 15, 25, 50].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeTask(task.key)}
                disabled={tasks.length === 1}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={addTask}>
            Add task
          </Button>
          <div className="flex items-center gap-2">
            <Badge tone="gold">Perfect day bonus: +200 coins and +50 ELO</Badge>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" size="lg" loading={saving}>
          Save routine
        </Button>
      </div>
    </form>
  )
}
