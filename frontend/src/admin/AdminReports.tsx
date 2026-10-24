import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  ProgressBar,
  SectionTitle,
  Spinner,
  Stat,
} from '../components/ui'
import { api, ApiError } from '../lib/api'
import { localDateString } from '../lib/time'
import type { ReportPayload, ReportRange } from '../lib/types'
import { useToast } from '../state/ToastContext'

const RANGES: { key: ReportRange; label: string }[] = [
  { key: '3d', label: '3 days' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

export function AdminReports({ userId }: { userId: string }) {
  const { push } = useToast()
  const [range, setRange] = useState<ReportRange>('week')
  const [report, setReport] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReport(
        await api.get<ReportPayload>(
          `/admin/users/${userId}/reports?range=${range}&local_date=${localDateString()}`,
        ),
      )
    } catch (error) {
      setReport(null)
      push(error instanceof ApiError ? error.detail : 'Could not load that report.', 'error')
    } finally {
      setLoading(false)
    }
  }, [push, range, userId])

  useEffect(() => {
    void load()
  }, [load])

  const maxTasks = Math.max(1, ...(report?.daily.map((day) => day.tasks) ?? [0]))
  const summary = report?.summary

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Reports"
        subtitle="The same rolling reports the user sees in their own account."
        action={
          <div className="flex gap-1">
            {RANGES.map((item) => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={range === item.key ? 'secondary' : 'ghost'}
                onClick={() => setRange(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        }
      />

      {loading && !report ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner /> Building the report…
        </div>
      ) : null}

      {!loading && !report ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">The report could not be loaded.</p>
          <Button type="button" size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      ) : null}

      {report && summary ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{report.days} days</Badge>
            <Badge tone="neutral">{report.start} to {report.end}</Badge>
            <Badge tone="neutral">Streak {report.streak}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Stat label="Tasks completed" value={summary.tasks_completed} hint={`${summary.tasks_late} late`} />
            <Stat label="On-time rate" value={`${summary.on_time_rate}%`} hint={`${summary.tasks_on_time} on time`} />
            <Stat label="Perfect routines" value={summary.perfect_routines} hint={`${summary.active_days} active days`} />
            <Stat label="Coins earned" value={summary.coins_earned.toLocaleString()} />
            <Stat label="ELO earned" value={summary.elo_earned.toLocaleString()} />
            <Stat label="Average timing gap" value={`${summary.average_delta_minutes} min`} />
          </div>

          <div className="glass-2 p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Daily activity</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {report.daily.map((day) => (
                <div key={day.date} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4rem] items-center gap-3">
                  <span className="text-xs font-bold text-muted">{day.label}</span>
                  <ProgressBar value={(day.tasks / maxTasks) * 100} />
                  <span className="text-right text-[11px] font-bold text-muted">
                    {day.tasks} task{day.tasks === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-2 p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">By routine</p>
            {report.routines.length === 0 ? (
              <p className="text-sm text-muted">No routine activity in this window.</p>
            ) : (
              <div className="space-y-2">
                {report.routines.map((routine) => (
                  <div key={routine.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold">{routine.name}</span>
                    <span className="text-xs text-muted">
                      {routine.tasks_completed} tasks · {routine.on_time_rate}% on time ·{' '}
                      {routine.coins_earned.toLocaleString()} coins · {routine.elo_earned} ELO
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </Card>
  )
}
