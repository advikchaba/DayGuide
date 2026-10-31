/** Local-clock helpers for scheduled task times. */

const MINUTES_PER_DAY = 24 * 60

/** Tasks in the account's first routine must sit at least this far apart. */
export const MIN_TASK_GAP_MINUTES = 30

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** "18:30" -> minutes since midnight, or null when the value is not a valid time. */
export function timeToMinutes(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export interface ScheduledTask {
  id: number
  scheduled_time: string
  position: number
}

/**
 * Same chronological key as the backend completion guard. Position and id make
 * the order deterministic for equal times; invalid legacy times sort last.
 */
export function taskScheduleKey(task: ScheduledTask): [number, number, number] {
  const minutes = timeToMinutes(task.scheduled_time)
  return [minutes == null ? Number.MAX_SAFE_INTEGER : minutes, task.position, task.id]
}

export function compareTaskSchedule(first: ScheduledTask, second: ScheduledTask): number {
  const a = taskScheduleKey(first)
  const b = taskScheduleKey(second)
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/** Shortest gap between two wall-clock times, wrapping across midnight. */
export function clockGapMinutes(first: string, second: string): number | null {
  const firstMinutes = timeToMinutes(first)
  const secondMinutes = timeToMinutes(second)
  if (firstMinutes == null || secondMinutes == null) return null
  const difference = Math.abs(firstMinutes - secondMinutes)
  return Math.min(difference, MINUTES_PER_DAY - difference)
}

export interface SpacingTask {
  id?: number
  title: string
  scheduled_time: string
}

/** The first task that is too close to `time`, ignoring `excludeId` when editing. */
export function findSpacingConflict(
  tasks: SpacingTask[],
  time: string,
  excludeId?: number,
): SpacingTask | null {
  for (const task of tasks) {
    if (excludeId != null && task.id === excludeId) continue
    const gap = clockGapMinutes(task.scheduled_time, time)
    if (gap != null && gap < MIN_TASK_GAP_MINUTES) return task
  }
  return null
}

/** The first pair of tasks that break the minimum gap. */
export function findPairwiseSpacingConflict(
  tasks: SpacingTask[],
): [SpacingTask, SpacingTask] | null {
  for (let index = 0; index < tasks.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < tasks.length; otherIndex += 1) {
      const gap = clockGapMinutes(
        tasks[index].scheduled_time,
        tasks[otherIndex].scheduled_time,
      )
      if (gap != null && gap < MIN_TASK_GAP_MINUTES) {
        return [tasks[index], tasks[otherIndex]]
      }
    }
  }
  return null
}

export function spacingConflictMessage(time: string, conflict: SpacingTask): string {
  return `Tasks need at least ${MIN_TASK_GAP_MINUTES} minutes between them. ${formatTime(
    time,
  )} is too close to "${conflict.title}" at ${formatTime(conflict.scheduled_time)}.`
}

export function spacingPairMessage(first: SpacingTask, second: SpacingTask): string {
  return `Tasks need at least ${MIN_TASK_GAP_MINUTES} minutes between them. "${first.title}" at ${formatTime(
    first.scheduled_time,
  )} is too close to "${second.title}" at ${formatTime(second.scheduled_time)}.`
}

/** The next half-hour slot that does not collide with any of the given tasks. */
export function nextFreeSlot(tasks: SpacingTask[], start = new Date()): string {
  const occupied = tasks
    .map((task) => timeToMinutes(task.scheduled_time))
    .filter((minutes): minutes is number => minutes != null)
  const startSlot = Math.ceil((start.getHours() * 60 + start.getMinutes() + 1) / 30) * 30

  for (let index = 0; index < MINUTES_PER_DAY / MIN_TASK_GAP_MINUTES; index += 1) {
    const candidate = (startSlot + index * MIN_TASK_GAP_MINUTES) % MINUTES_PER_DAY
    const free = occupied.every((minutes) => {
      const difference = Math.abs(candidate - minutes)
      return Math.min(difference, MINUTES_PER_DAY - difference) >= MIN_TASK_GAP_MINUTES
    })
    if (free) {
      return `${pad(Math.floor(candidate / 60))}:${pad(candidate % 60)}`
    }
  }
  return nextSlot()
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
