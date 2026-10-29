import { formatTime } from './time'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export const TASKS_CHANGED_EVENT = 'routinery:tasks-changed'

const PROMPT_KEY_PREFIX = 'routinery.notifications.promptDismissed'
const WORKER_URL = '/sw.js'
const STALE_AFTER_MS = 15 * 60 * 1000

let workerRegistration: Promise<ServiceWorkerRegistration | null> | null = null

export interface ReminderNotificationTask {
  id?: number
  title: string
  scheduled_time: string
}

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function notificationsSupported(): boolean {
  return getNotificationPermission() !== 'unsupported'
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = getNotificationPermission()
  if (current !== 'default') return current

  try {
    return await Notification.requestPermission()
  } catch {
    return 'unsupported'
  }
}

export function registerNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null)
  }

  if (!workerRegistration) {
    workerRegistration = (async () => {
      try {
        const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: '/' })
        await navigator.serviceWorker.ready
        return registration
      } catch {
        workerRegistration = null
        return null
      }
    })()
  }
  return workerRegistration
}

export async function showReminderNotification(
  task: ReminderNotificationTask,
  routineName: string,
): Promise<boolean> {
  if (getNotificationPermission() !== 'granted') return false

  const body = `${routineName} · scheduled for ${formatTime(task.scheduled_time)}. Tap to check in.`
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: `dayguide-task-${task.id ?? 'test'}`,
    data: { url: '/app' },
  }

  const registration = await registerNotificationWorker()
  if (registration) {
    try {
      await registration.showNotification(task.title, options)
      return true
    } catch {
      // Fall through to the window Notification constructor on browsers that
      // expose the API but reject service-worker notifications.
    }
  }

  try {
    new Notification(task.title, options)
    return true
  } catch {
    return false
  }
}

/** A stale timer can fire after a laptop sleep; don't surface old reminders. */
export function notificationIsStale(scheduledAt: number): boolean {
  return Date.now() - scheduledAt > STALE_AFTER_MS
}

export function emitTasksChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT))
}

function promptDismissedKey(userId: string, androidApp: boolean): string {
  return `${PROMPT_KEY_PREFIX}.${androidApp ? 'android.' : 'web.'}${userId}`
}

export function wasNotificationPromptDismissed(userId: string, androidApp: boolean): boolean {
  try {
    return localStorage.getItem(promptDismissedKey(userId, androidApp)) !== null
  } catch {
    return false
  }
}

export function dismissNotificationPrompt(userId: string, androidApp: boolean): void {
  try {
    localStorage.setItem(promptDismissedKey(userId, androidApp), new Date().toISOString())
  } catch {
    // Ignore storage failures; at worst the prompt is shown again later.
  }
}
