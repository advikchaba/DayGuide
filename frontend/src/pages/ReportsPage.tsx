import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionTitle,
  Spinner,
  Stat,
} from '../components/ui'
import { api, ApiError } from '../lib/api'
import { localDateString } from '../lib/time'
import type { ReportPayload, ReportRange } from '../lib/types'
import { useToast } from '../state/ToastContext'

const RANGES: { key: ReportRange; label: string; hint: string }[] = [
  { key: '3d', label: 'Last 3 days', hint: '3 days' },
  { key: 'week', label: 'Weekly', hint: '7 days' },
  { key: 'month', label: 'Last month', hint: '30 days' },
]

function formatRangeDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

function Compare({
  current,
  previous,
  kind = 'count',
  suffix = '',
  invert = false,
}: {
  current: number
  previous: number
  kind?: 'count' | 'points' | 'minutes' | 'coins' | 'elo'
  suffix?: string
  invert?: boolean
}) {
  const difference = current - previous
  let text: string
  switch (kind) {
    case 'points':
      text = `${difference > 0 ? '+' : ''}${difference.toFixed(1)} pts`
      break
    case 'minutes':
      text = `${difference > 0 ? '+' : ''}${Math.round(difference)} min`
      break
    case 'coins':
      text = `${difference > 0 ? '+' : ''}${Math.round(difference).toLocaleString()} coins`
      break
    case 'elo':
      text = `${difference > 0 ? '+' : ''}${Math.round(difference)} ELO`
      break
    default:
      text = `${difference > 0 ? '+' : ''}${Math.round(difference)}${suffix}`
  }

  const improved = invert ? difference < 0 : difference > 0
  const tone =
    Math.abs(difference) < 0.05
      ? 'text-muted'
      : improved
        ? 'text-emerald-300'
        : 'text-rose-300'
  return <span className={`text-[11px] font-bold ${tone}`}>{text} vs previous</span>
}

function ReportStat({
  label,
  value,
  hint,
  compare,
}: {
  label: string
  value: ReactNode
  hint?: string
  compare?: ReactNode
}) {
  return (
    <div className="glass-2 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {compare ? <p className="mt-1.5">{compare}</p> : null}
    </div>
  )
}

export function ReportsPage() {
  const { push } = useToast()
  const [range, setRange] = useState<ReportRange>('week')
  const [report, setReport] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReport(
        await api.get<ReportPayload>(
          `/reports?range=${range}&local_date=${localDateString()}`,
        ),
      )
    } catch (error) {
      setReport(null)
      push(error instanceof ApiError ? error.detail : 'Could not load your report.', 'error')
    } finally {
      setLoading(false)
    }
  }, [range, push])

  useEffect(() => {
    void load()
  }, [load])

  const maxTasks = useMemo(
    () => Math.max(1, ...(report?.daily.map((day) => day.tasks) ?? [0])),
    [report],
  )

  if (loading && !report) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Building your report…
      </div>
    )
  }

  if (!report) {
    return (
      <EmptyState
        title="Could not load your report"
        body="The report service did not answer. Try again, or check your connection."
        action={<Button onClick={load}>Try again</Button>}
      />
    )
  }

  const { summary, previous } = report
  const hasActivity = summary.tasks_completed > 0 || summary.perfect_routines > 0
  const previousLabel = `${report.days} days`

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Reports"
        subtitle="Your consistency, timing and rewards over rolling windows."
        action={<Badge tone="neutral">{report.days} days</Badge>}
      />

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setRange(option.key)}
            aria-pressed={range === option.key}
            className={[
              'focus-ring rounded-lg px-3 py-2 text-sm font-bold transition',
              range === option.key
                ? 'bg-surface-2 text-ink'
                : 'bg-surface text-muted hover:text-ink',
            ].join(' ')}
          >
            {option.label}
            <span className="ml-2 text-[11px] font-medium opacity-70">{option.hint}</span>
          </button>
        ))}
        {loading ? (
          <span className="flex items-center gap-2 text-xs text-muted">
            <Spinner className="h-3.5 w-3.5" /> Updating
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {formatRangeDate(report.start)} – {formatRangeDate(report.end)}
        </span>
        <span>
          {report.label} · {previousLabel} · compared with the previous {report.days} days
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportStat
          label="Tasks done"
          value={summary.tasks_completed}
          hint={`${summary.tasks_on_time} on time · ${summary.tasks_late} late`}
          compare={
            <Compare
              current={summary.tasks_completed}
              previous={previous.tasks_completed}
              suffix=" tasks"
            />
          }
        />
        <ReportStat
          label="On-time rate"
          value={`${summary.on_time_rate.toFixed(1)}%`}
          hint="inside the 20 minute window"
          compare={
            <Compare
              current={summary.on_time_rate}
              previous={previous.on_time_rate}
              kind="points"
            />
          }
        />
        <ReportStat
          label="Perfect routines"
          value={summary.perfect_routines}
          hint={`${summary.active_days} active ${summary.active_days === 1 ? 'day' : 'days'}`}
          compare={
            <Compare
              current={summary.perfect_routines}
              previous={previous.perfect_routines}
              suffix=" routines"
            />
          }
        />
        <ReportStat
          label="Coins earned"
          value={summary.coins_earned.toLocaleString()}
          hint="tasks + perfect-day bonuses"
          compare={
            <Compare
              current={summary.coins_earned}
              previous={previous.coins_earned}
              kind="coins"
            />
          }
        />
        <ReportStat
          label="ELO change"
          value={signed(summary.elo_earned)}
          hint="net check-in change"
          compare={
            <Compare
              current={summary.elo_earned}
              previous={previous.elo_earned}
              kind="elo"
            />
          }
        />
        <ReportStat
          label="Average gap"
          value={`${Math.round(summary.average_delta_minutes)} min`}
          hint="from scheduled time"
          compare={
            <Compare
              current={summary.average_delta_minutes}
              previous={previous.average_delta_minutes}
              kind="minutes"
              invert
            />
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl tracking-tight">Daily rhythm</h2>
              <p className="text-sm text-muted">Tasks completed and perfect days, day by day.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-accent" /> On time
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-rose-400/60" /> Late
              </span>
            </div>
          </div>

          {hasActivity ? (
            <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {report.daily.map((day) => {
                const width = day.tasks ? (day.tasks / maxTasks) * 100 : 0
                const onTimeShare = day.tasks ? (day.on_time / day.tasks) * 100 : 0
                return (
                  <div
                    key={day.date}
                    className="grid grid-cols-[54px_1fr] gap-3 sm:grid-cols-[72px_1fr_92px]"
                  >
                    <div>
                      <p className="text-xs font-bold">{day.weekday}</p>
                      <p className="text-[11px] text-muted">{day.label}</p>
                    </div>
                    <div>
                      <div
                        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
                        role="img"
                        aria-label={`${day.tasks} tasks, ${day.on_time} on time, ${day.late} late, ${day.perfect} perfect routines`}
                      >
                        <div className="flex h-full" style={{ width: `${width}%` }}>
                          <div
                            style={{
                              width: `${onTimeShare}%`,
                              background: 'var(--accent)',
                            }}
                          />
                          <div className="flex-1 bg-rose-400/60" />
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        {day.tasks === 0
                          ? 'No check-ins'
                          : `${day.tasks} tasks · ${day.on_time} on time${
                              day.perfect ? ` · ${day.perfect} perfect` : ''
                            }`}
                      </p>
                    </div>
                    <div className="hidden text-right text-[11px] sm:block">
                      <p className="font-bold text-amber-200">
                        {day.coins.toLocaleString()} coins
                      </p>
                      <p className="text-muted">{signed(day.elo)} ELO</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">
              No check-ins in this range yet. Try a shorter range or tick a task.
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-4">
            <h2 className="text-2xl tracking-tight">Timing</h2>
            <p className="text-sm text-muted">Accuracy is the score.</p>
          </div>

          <div className="space-y-3">
            <div className="glass-2 px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  On-time rate
                </span>
                <span className="text-2xl font-bold">{summary.on_time_rate.toFixed(1)}%</span>
              </div>
              <ProgressBar value={summary.on_time_rate} className="mt-2" />
              <p className="mt-2 text-xs text-muted">
                {summary.tasks_on_time} of {summary.tasks_completed} check-ins inside the window.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Late check-ins" value={summary.tasks_late} hint="outside 20 min" />
              <Stat
                label="Average gap"
                value={`${Math.round(summary.average_delta_minutes)} min`}
                hint="from schedule"
              />
              <Stat
                label="Current streak"
                value={`${report.streak} ${report.streak === 1 ? 'day' : 'days'}`}
                hint={`best ${report.best_streak}`}
              />
              <Stat
                label="Active days"
                value={summary.active_days}
                hint={`of ${report.days}`}
              />
            </div>

            {report.best_day ? (
              <div className="glass-2 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Best day
                </p>
                <p className="mt-1 font-bold">
                  {report.best_day.weekday}, {report.best_day.label}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {report.best_day.tasks} tasks · {report.best_day.on_time} on time ·{' '}
                  {report.best_day.coins.toLocaleString()} coins
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4">
          <h2 className="text-2xl tracking-tight">By routine</h2>
          <p className="text-sm text-muted">
            Where your check-ins came from in this window.
          </p>
        </div>

        {report.routines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No routines yet.{' '}
            <Link to="/routines/new" className="font-bold text-ink underline-offset-4 hover:underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {report.routines.map((routine) => (
              <li key={routine.id} className="glass-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{routine.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {routine.tasks_completed} tasks · {routine.tasks_on_time} on time ·{' '}
                      {routine.perfect_routines} perfect
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold text-amber-200">
                      {routine.coins_earned.toLocaleString()} coins
                    </p>
                    <p className="text-muted">{signed(routine.elo_earned)} ELO</p>
                  </div>
                </div>
                <ProgressBar value={routine.on_time_rate} className="mt-2" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted">
        Reports use your local dates. Only completed check-ins are counted; un-ticking a task
        removes it from the report. Weekly is the last 7 days and last month is the last 30 days.
      </p>
    </div>
  )
}
