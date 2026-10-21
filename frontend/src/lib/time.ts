/** Local-clock helpers for scheduled task times. */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** YYYY-MM-DD in the browser's local timezone (not UTC). */
export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** HH:MM in the browser's local timezone. */
export function localTimeString(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The next half-hour slot, optionally moved forward by whole slots. */
export function nextSlot(offsetMinutes = 0): string {
  const date = new Date()
  date.setSeconds(0, 0)
  const minutes = date.getMinutes()
  const rounded = Math.ceil((minutes + 1) / 30) * 30
  date.setMinutes(rounded + offsetMinutes)
  return localTimeString(date)
}

/** "18:30" -> "6:30 PM" for display. */
export function formatTime(hhmm: string): string {
  const [hoursText, minutesText] = hhmm.split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm

  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${pad(minutes)} ${suffix}`
}
