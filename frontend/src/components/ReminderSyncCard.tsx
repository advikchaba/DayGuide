import { useMemo, useState } from 'react'
import { Badge, Button, Card } from './ui'
import { buildReminderIntent, isAndroidDevice } from '../lib/reminders'
import type { Routine } from '../lib/types'
import { useToast } from '../state/ToastContext'

/**
 * Hands the current routine schedule to the Android APK. The APK stores the
 * times and schedules local AlarmManager notifications, so reminders still
 * arrive when DayGuide is closed.
 */
export function ReminderSyncCard({ routines }: { routines: Routine[] }) {
  const { push } = useToast()
  const [opening, setOpening] = useState(false)

  const taskCount = useMemo(() => {
    const ids = new Set<number>()
    for (const routine of routines) {
      for (const task of routine.tasks) {
        if (task.scheduled_time) ids.add(task.id)
      }
    }
    return ids.size
  }, [routines])

  if (!isAndroidDevice()) return null

  const handleSync = () => {
    const intent = buildReminderIntent(routines)
    if (!intent) {
      push('Add a task with a scheduled time first.', 'error')
      return
    }

    setOpening(true)
    try {
      window.location.href = intent
    } catch {
      setOpening(false)
      push('Could not open the Android app. Install the latest DayGuide APK and try again.', 'error')
      return
    }
    window.setTimeout(() => {
      setOpening(false)
      if (document.visibilityState === 'visible') {
        push('If DayGuide did not open, install the latest Android app and try again.', 'info')
      }
    }, 2500)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-muted">Task reminders</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Get a notification at each task&apos;s scheduled time, even when DayGuide is closed.
            Requires the DayGuide Android app. Allow notifications and Alarms &amp; reminders for
            exact timing.
          </p>
        </div>
        <Badge tone={taskCount > 0 ? 'accent' : 'neutral'}>
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleSync} loading={opening} disabled={taskCount === 0}>
          Sync Android reminders
        </Button>
        <span className="text-xs text-muted">
          Reminders are saved on this phone. Sync again after changing task times.
        </span>
      </div>
    </Card>
  )
}
