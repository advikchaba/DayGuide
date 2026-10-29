import type { Routine } from './types'

// Package and scheme are deliberately unchanged so existing DayGuide installs
// can still receive the reminder schedule after the user-facing rename.
const ANDROID_PACKAGE = 'com.advikchaba.routinery'
const FALLBACK_URL = 'https://dayguide-advik-chaba.vercel.app/profile'
const SYNC_KEY = 'routinery.androidReminders.v1'

export interface ReminderTaskPayload {
  id: number
  title: string
  time: string
}

/** True on Android Chrome / the DayGuide TWA. */
export function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

/**
 * True when the page is running inside the DayGuide Android wrapper rather
 * than ordinary Chrome. A TWA launched from the APK sets an android-app://
 * referrer; the display-mode check covers Chrome versions that omit it.
 */
export function isAndroidApp(): boolean {
  if (!isAndroidDevice() || typeof document === 'undefined') return false
  if (document.referrer.startsWith('android-app://')) return true
  return window.matchMedia?.('(display-mode: fullscreen)').matches ?? false
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/** The deduplicated task list the Android wrapper can schedule. */
export function selectReminderTasks(routines: Routine[]): ReminderTaskPayload[] {
  const seen = new Set<number>()
  return routines
    .flatMap((routine) => routine.tasks)
    .filter((task) => isValidTime(task.scheduled_time))
    .filter((task) => {
      if (seen.has(task.id)) return false
      seen.add(task.id)
      return true
    })
    .map((task) => ({ id: task.id, title: task.title.trim(), time: task.scheduled_time }))
    .filter((task) => task.title.length > 0)
    .sort((first, second) => first.time.localeCompare(second.time) || first.id - second.id)
    .slice(0, 200)
}

/** Stable fingerprint used to tell the user when the native schedule is stale. */
export function reminderFingerprint(routines: Routine[]): string {
  return selectReminderTasks(routines)
    .map((task) => `${task.id}:${task.time}:${task.title}`)
    .join('|')
}

/**
 * Builds an Android intent that hands the current task schedule to the APK.
 *
 * The native app cannot read Chrome's local storage, so the web app sends the
 * task list across a one-time custom-scheme bridge. The APK stores it and uses
 * AlarmManager for local notifications, which also work while the app is closed.
 */
export function buildReminderIntent(routines: Routine[]): string | null {
  const tasks = selectReminderTasks(routines)
  if (tasks.length === 0) return null

  const json = JSON.stringify({ version: 1, tasks })
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const fallback = encodeURIComponent(FALLBACK_URL)

  return (
    `intent://sync-reminders?data=${encoded}#Intent;` +
    `scheme=routinery;component=${ANDROID_PACKAGE}/${ANDROID_PACKAGE}.ReminderSyncActivity;` +
    `package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
  )
}

export function markAndroidRemindersSynced(routines: Routine[]): void {
  try {
    localStorage.setItem(
      SYNC_KEY,
      JSON.stringify({ at: Date.now(), fingerprint: reminderFingerprint(routines) }),
    )
  } catch {
    // Storage can be unavailable in private browsing; the prompt will simply
    // appear again next time instead of breaking the setup flow.
  }
}

export function androidRemindersConfigured(): boolean {
  try {
    return localStorage.getItem(SYNC_KEY) !== null
  } catch {
    return false
  }
}

export function androidRemindersNeedSync(routines: Routine[]): boolean {
  if (!androidRemindersConfigured()) return true
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as { fingerprint?: string }
    return parsed.fingerprint !== reminderFingerprint(routines)
  } catch {
    return true
  }
}

/**
 * Hands the schedule to the APK and remembers that setup was started. Returns
 * false when there is nothing valid to schedule.
 */
export function openAndroidReminderSync(routines: Routine[]): boolean {
  const intent = buildReminderIntent(routines)
  if (!intent) return false
  markAndroidRemindersSynced(routines)
  window.location.href = intent
  return true
}
