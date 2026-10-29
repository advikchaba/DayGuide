import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Modal } from './ui'
import { api } from '../lib/api'
import {
  androidRemindersConfigured,
  isAndroidApp,
  isAndroidDevice,
  openAndroidReminderSync,
  selectReminderTasks,
} from '../lib/reminders'
import {
  dismissNotificationPrompt,
  emitTasksChanged,
  getNotificationPermission,
  notificationIsStale,
  registerNotificationWorker,
  requestNotificationPermission,
  showReminderNotification,
  TASKS_CHANGED_EVENT,
  wasNotificationPromptDismissed,
  type NotificationPermissionState,
} from '../lib/notifications'
import { localDateString, timeToMinutes } from '../lib/time'
import type { Routine } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

/**
 * Keeps the browser notification schedule in sync with today's checklist and
 * asks for notification permission after sign-in / first app open.
 *
 * The Android wrapper uses its own AlarmManager alarms for closed-app delivery;
 * this component only schedules browser notifications while the page is open.
 */
export function NotificationCenter() {
  const { profile } = useAuth()
  const { push } = useToast()
  const location = useLocation()

  const [routines, setRoutines] = useState<Routine[]>([])
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  )
  const [promptOpen, setPromptOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)

  const isApp = isAndroidApp()
  const reminderTaskCount = useMemo(() => selectReminderTasks(routines).length, [routines])

  const loadRoutines = useCallback(async (): Promise<Routine[]> => {
    if (!profile) {
      setRoutines([])
      return []
    }
    try {
      const data = await api.get<Routine[]>(`/routines?local_date=${localDateString()}`)
      setRoutines(data)
      return data
    } catch {
      // Background refreshes stay quiet; the routine page handles visible errors.
      return []
    }
  }, [profile])

  useEffect(() => {
    void loadRoutines()
  }, [loadRoutines])

  useEffect(() => {
    if (!profile) return

    const refresh = () => {
      setPermission(getNotificationPermission())
      void loadRoutines()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    window.addEventListener(TASKS_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(refresh, 5 * 60 * 1000)

    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [profile, loadRoutines])

  useEffect(() => {
    if (permission === 'granted') {
      void registerNotificationWorker()
    }
  }, [permission])

  // Ask once per account and platform. Existing accounts get it on their next
  // visit; new accounts get it after signup when a profile becomes available.
  useEffect(() => {
    if (!profile || location.pathname.startsWith('/auth/callback')) return
    if (wasNotificationPromptDismissed(profile.id, isApp)) return

    const shouldPrompt = isApp
      ? !androidRemindersConfigured() && reminderTaskCount > 0
      : permission === 'default'

    if (!shouldPrompt) return

    const timer = window.setTimeout(() => setPromptOpen(true), 1200)
    return () => window.clearTimeout(timer)
  }, [profile, isApp, permission, reminderTaskCount, location.pathname])

  useEffect(() => {
    if (promptOpen && permission !== 'default' && !isApp) {
      setPromptOpen(false)
    }
  }, [promptOpen, permission, isApp])

  // A page timer is reliable while DayGuide is open. The Android APK handles
  // closed-app reminders with native alarms, so skip duplicate browser alerts
  // once that schedule has been handed over.
  useEffect(() => {
    if (permission !== 'granted') return
    if (isAndroidDevice() && androidRemindersConfigured()) return

    const now = Date.now()
    const timers: number[] = []
    const seen = new Set<number>()

    for (const routine of routines) {
      for (const task of routine.tasks) {
        if (task.completed_today || seen.has(task.id)) continue
        const minutes = timeToMinutes(task.scheduled_time)
        if (minutes == null) continue

        const target = new Date()
        target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
        const targetTime = target.getTime()
        const delay = targetTime - now
        if (delay <= 0 || delay > 24 * 60 * 60 * 1000) continue

        seen.add(task.id)
        timers.push(
          window.setTimeout(() => {
            if (notificationIsStale(targetTime)) return
            void showReminderNotification(task, routine.name)
          }, delay),
        )
      }
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [routines, permission])

  const dismiss = () => {
    if (profile) dismissNotificationPrompt(profile.id, isApp)
    setPromptOpen(false)
  }

  const enable = async () => {
    if (!profile) return
    setRequesting(true)
    try {
      if (isApp) {
        const data = routines.length > 0 ? routines : await loadRoutines()
        if (!openAndroidReminderSync(data)) {
          push('Add a task with a scheduled time first.', 'error')
          return
        }
        emitTasksChanged()
        dismissNotificationPrompt(profile.id, true)
        setPromptOpen(false)
        push('Finish setup in the DayGuide app.', 'info')
        return
      }

      const result = await requestNotificationPermission()
      setPermission(result)
      emitTasksChanged()
      if (result === 'granted') {
        dismissNotificationPrompt(profile.id, false)
        setPromptOpen(false)
        await registerNotificationWorker()
        push('Notifications enabled. We’ll remind you at task times.', 'success')
      } else if (result === 'denied') {
        push('Notifications are blocked. Allow them in your browser settings.', 'error')
      } else if (result === 'unsupported') {
        push('This browser does not support notifications.', 'error')
      } else {
        push('Notification permission was not granted.', 'info')
      }
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Modal
      open={promptOpen}
      onClose={dismiss}
      title={isApp ? 'Turn on Android reminders?' : 'Turn on task reminders?'}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss} disabled={requesting}>
            Not now
          </Button>
          <Button onClick={enable} loading={requesting}>
            {isApp ? 'Open Android setup' : 'Enable notifications'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-muted">
        <p>
          DayGuide can notify you when each task is due, so you do not have to keep checking the
          clock.
        </p>

        {isApp ? (
          <ul className="space-y-2 text-sm">
            <li>• Android will ask for notification permission.</li>
            <li>• Allow Alarms &amp; reminders for exact timing.</li>
            <li>• Reminders keep working after the app is closed.</li>
          </ul>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              <li>• Your browser will ask for notification permission.</li>
              <li>• You get a reminder at each task’s scheduled time while DayGuide is open.</li>
              <li>• Install the Android app for reminders when the app is closed.</li>
            </ul>
            <p className="text-xs text-muted">
              You can change this later under Profile → Task reminders.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
