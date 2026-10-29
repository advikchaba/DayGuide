import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card } from './ui'
import {
  androidRemindersNeedSync,
  isAndroidApp,
  isAndroidDevice,
  openAndroidReminderSync,
  selectReminderTasks,
} from '../lib/reminders'
import {
  emitTasksChanged,
  getNotificationPermission,
  registerNotificationWorker,
  requestNotificationPermission,
  showReminderNotification,
  TASKS_CHANGED_EVENT,
  type NotificationPermissionState,
} from '../lib/notifications'
import { localTimeString } from '../lib/time'
import type { Routine } from '../lib/types'
import { useToast } from '../state/ToastContext'

/**
 * Persistent reminder control. Android gets the native AlarmManager bridge;
 * browsers get permission-driven reminders while the page is open.
 */
export function ReminderSyncCard({ routines }: { routines: Routine[] }) {
  const { push } = useToast()
  const [opening, setOpening] = useState(false)
  const [testing, setTesting] = useState(false)
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  )
  const [needSync, setNeedSync] = useState(() => androidRemindersNeedSync(routines))

  const android = isAndroidDevice()
  const androidApp = isAndroidApp()
  const taskCount = useMemo(() => selectReminderTasks(routines).length, [routines])

  useEffect(() => {
    const refresh = () => {
      setPermission(getNotificationPermission())
      setNeedSync(androidRemindersNeedSync(routines))
    }
    window.addEventListener(TASKS_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [routines])

  const handleEnableWeb = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    emitTasksChanged()
    if (result === 'granted') {
      await registerNotificationWorker()
      push('Browser notifications enabled. Keep this page open to receive them.', 'success')
    } else if (result === 'denied') {
      push('Notifications are blocked. Allow them in your browser settings.', 'error')
    } else if (result === 'unsupported') {
      push('This browser does not support notifications.', 'error')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const sent = await showReminderNotification(
        { title: 'Test reminder', scheduled_time: localTimeString() },
        'DayGuide',
      )
      push(
        sent ? 'Test notification sent.' : 'Could not send a notification. Allow notifications first.',
        sent ? 'success' : 'error',
      )
    } finally {
      setTesting(false)
    }
  }

  const handleSync = () => {
    if (!openAndroidReminderSync(routines)) {
      push('Add a task with a scheduled time first.', 'error')
      return
    }

    setNeedSync(false)
    setOpening(true)
    emitTasksChanged()
    push('Finish setup in the DayGuide app.', 'info')
    window.setTimeout(() => {
      setOpening(false)
      if (document.visibilityState === 'visible') {
        push('If DayGuide did not open, install the latest Android app and try again.', 'info')
      }
    }, 2500)
  }

  const webStatus =
    permission === 'granted'
      ? 'Browser notifications are on while DayGuide is open.'
      : permission === 'denied'
        ? 'Browser notifications are blocked in your browser settings.'
        : permission === 'unsupported'
          ? 'This browser does not support notifications.'
          : 'Enable browser notifications to get a reminder at each task time while this page is open.'

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-muted">
            {androidApp ? 'Android task reminders' : 'Task reminders'}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {androidApp
              ? 'DayGuide uses offline alarms on this phone, so reminders arrive even when the app is closed. Sync again after changing task times.'
              : android
                ? 'Sync offline alarms to the DayGuide Android app, or enable browser notifications while this page is open.'
                : 'Get a browser notification at each task’s scheduled time while DayGuide is open.'}
          </p>
        </div>
        <Badge tone={taskCount > 0 ? 'accent' : 'neutral'}>
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {android ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSync}
            loading={opening}
            disabled={taskCount === 0}
          >
            {needSync ? 'Sync Android reminders' : 'Sync reminders again'}
          </Button>
        ) : null}

        {!androidApp && permission === 'default' ? (
          <Button variant="secondary" size="sm" onClick={handleEnableWeb}>
            Enable browser notifications
          </Button>
        ) : null}

        {!androidApp && permission === 'granted' ? (
          <Button variant="secondary" size="sm" onClick={handleTest} loading={testing}>
            Send test notification
          </Button>
        ) : null}

        {android && needSync && taskCount > 0 ? (
          <Badge tone="gold">Sync needed after schedule changes</Badge>
        ) : null}
      </div>

      {!androidApp ? <p className="mt-3 text-xs text-muted">{webStatus}</p> : null}
      {androidApp ? (
        <p className="mt-3 text-xs text-muted">
          Reminders are saved on this phone. Allow Notifications and Alarms &amp; reminders for exact
          timing.
        </p>
      ) : null}
    </Card>
  )
}
