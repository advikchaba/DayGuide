import { useCallback, useEffect, useState } from 'react'
import { Avatar, Card, RankBadge, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { RANK_TIERS, type Leaderboard, type LeaderboardEntry } from '../lib/types'
import { useToast } from '../state/ToastContext'
import { useAuth } from '../state/AuthContext'

const METRICS = [
  { key: 'elo', label: 'ELO' },
  { key: 'coins', label: 'Coins' },
  { key: 'matches_won', label: 'Race wins' },
  { key: 'streak', label: 'Best streak' },
] as const

type Metric = (typeof METRICS)[number]['key']

function medal(position: number): string | null {
  if (position === 1) return '🥇'
  if (position === 2) return '🥈'
  if (position === 3) return '🥉'
  return null
}

export function LeaderboardPage() {
  const { profile } = useAuth()
  const { push } = useToast()

  const [metric, setMetric] = useState<Metric>('elo')
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (next: Metric) => {
      setLoading(true)
      try {
        setBoard(await api.get<Leaderboard>(`/leaderboard?limit=50&metric=${next}`))
      } catch (error) {
        push(error instanceof ApiError ? error.detail : 'Could not load the ladder.', 'error')
      } finally {
        setLoading(false)
      }
    },
    [push],
  )

  useEffect(() => {
    void load(metric)
  }, [metric, load])

  const metricValue = (entry: LeaderboardEntry): string => {
    switch (metric) {
      case 'coins':
        return `🪙 ${entry.coins.toLocaleString()}`
      case 'matches_won':
        return `🏅 ${entry.matches_won}`
      case 'streak':
        return `🔥 ${entry.streak}`
      default:
        return `${entry.elo} ELO`
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Global ladder"
        subtitle="Six tiers: Copper → Bronze → Silver → Gold → Platinum → Ruby. Everyone starts at 100 ELO."
      />

      {/* Tier strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {RANK_TIERS.map((tier) => {
          const mine = profile?.rank.name === tier.name
          return (
            <div
              key={tier.name}
              className={[
                'glass-2 px-3 py-3 text-center transition',
                mine ? 'ring-1 ring-offset-0' : '',
              ].join(' ')}
              style={mine ? { boxShadow: `0 0 0 1px ${tier.color}` } : undefined}
            >
              <p className="text-xs font-bold" style={{ color: tier.color }}>
                {tier.name}
              </p>
              <p className="text-[11px] text-muted">
                {tier.min_elo}–{tier.max_elo}
              </p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {METRICS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMetric(option.key)}
            className={[
              'focus-ring rounded-xl border px-3 py-2 text-sm font-semibold transition',
              metric === option.key
                ? 'border-accent/60 bg-accent/15'
                : 'border-line bg-surface-2/50 text-muted hover:text-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted">
          <Spinner /> Counting the ladder…
        </div>
      ) : (
        <>
          {board?.you ? (
            <Card className="flex flex-wrap items-center gap-4 border-accent/40">
              <span className="text-sm font-bold text-muted">Your position</span>
              <span className="text-2xl font-black">#{board.you.position}</span>
              <Avatar slug={board.you.avatar_slug} size={36} />
              <span className="font-semibold">@{board.you.username}</span>
              <RankBadge rank={{ name: board.you.rank_name, color: board.you.rank_color }} elo={board.you.elo} />
              <span className="ml-auto text-sm font-bold">{metricValue(board.you)}</span>
              <span className="w-full text-xs text-muted sm:w-auto">
                of {board.total_players} ranked players
              </span>
            </Card>
          ) : null}

          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-[color:var(--border)]">
              {board?.entries.map((entry) => (
                <li
                  key={entry.user_id}
                  className={[
                    'flex flex-wrap items-center gap-3 px-4 py-3 transition',
                    entry.is_you ? 'bg-accent/10' : 'hover:bg-surface-2/40',
                  ].join(' ')}
                >
                  <span className="w-9 text-center text-sm font-black text-muted">
                    {medal(entry.position) ?? `#${entry.position}`}
                  </span>
                  <Avatar slug={entry.avatar_slug} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      @{entry.username}
                      {entry.is_you ? <span className="ml-2 text-xs text-accent">you</span> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {entry.elo} ELO · {entry.matches_won} wins · 🪙 {entry.coins.toLocaleString()}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <RankBadge rank={{ name: entry.rank_name, color: entry.rank_color }} size="sm" />
                    <span className="hidden text-sm font-bold sm:inline">{metricValue(entry)}</span>
                  </div>
                </li>
              ))}

              {board && board.entries.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-muted">No ranked players yet. Be the first.</li>
              ) : null}
            </ul>
          </Card>

          <p className="text-xs text-muted">
            Ranked points come from perfect routines (+50 ELO) and race wins (+50 ELO). Photo verification is what keeps
            the ladder honest.
          </p>
        </>
      )}
    </div>
  )
}
