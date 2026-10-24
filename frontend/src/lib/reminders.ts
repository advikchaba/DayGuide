import type { Routine } from './types'

// Package and scheme are deliberately unchanged so existing DayGuide installs
// can still receive the reminder schedule after the user-facing rename.
const ANDROID_PACKAGE = 'com.advikchaba.routinery'
const FALLBACK_URL = 'https://dayguide-advik-chaba.vercel.app/profile'

/** True on Android Chrome / the DayGuide TWA. */
export function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/**
 * Builds an Android intent that hands the current task schedule to the APK.
 *
 * The native app cannot read Chrome's local storage, so the web app sends the
 * task list across a one-time custom-scheme bridge. The APK stores it and uses
 * AlarmManager for local notifications, which also work while the app is closed.
 */
export function buildReminderIntent(routines: Routine[]): string | null {
  const seen = new Set<number>()
  const tasks = routines
    .flatMap((routine) => routine.tasks)
    .filter((task) => isValidTime(task.scheduled_time))
    .filter((task) => {
      if (seen.has(task.id)) return false
      seen.add(task.id)
      return true
    })
    .map((task) => ({ id: task.id, title: task.title.trim(), time: task.scheduled_time }))
    .filter((task) => task.title.length > 0)
    .slice(0, 200)

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
