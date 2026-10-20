import { useCallback, useEffect, useState } from 'react'
import { Avatar, Card, RankBadge, RankMark, SectionTitle, Spinner } from '../components/ui'
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
        return `${entry.coins.toLocaleString()} coins`
      case 'matches_won':
        return `${entry.matches_won} wins`
      case 'streak':
        return `${entry.streak} day streak`
      default:
        return `${entry.elo} ELO`
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Global ladder"
        subtitle="Six tiers, one ladder. Everyone starts at 100 ELO."
      />

      {/* Tier strip — the only place rank marks live. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {RANK_TIERS.map((tier) => {
          const mine = profile?.rank.name === tier.name
          return (
            <div
              key={tier.name}
              className={[
                'flex flex-col items-center gap-2 rounded-lg px-3 py-4 text-center transition',
                mine ? 'bg-surface-2' : 'bg-surface',
              ].join(' ')}
            >
              <RankMark name={tier.name} size={22} />
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
              'focus-ring rounded-lg px-3 py-2 text-sm font-bold transition',
              metric === option.key ? 'bg-surface-2 text-ink' : 'bg-surface text-muted hover:text-ink',
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
            <Card className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-bold text-muted">Your position</span>
              <span className="text-2xl font-bold">#{board.you.position}</span>
              <Avatar slug={board.you.avatar_slug} size={36} />
              <span className="font-bold">@{board.you.username}</span>
              <RankBadge rank={{ name: board.you.rank_name }} elo={board.you.elo} />
              <span className="ml-auto text-sm font-bold">{metricValue(board.you)}</span>
              <span className="w-full text-xs text-muted sm:w-auto">of {board.total_players} ranked players</span>
            </Card>
          ) : null}

          <Card className="overflow-hidden p-2">
            <ul className="space-y-1">
              {board?.entries.map((entry) => (
                <li
                  key={entry.user_id}
                  className={[
                    'flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 transition',
                    entry.is_you ? 'bg-accent-soft' : 'hover:bg-surface-2',
                  ].join(' ')}
                >
                  <span className="w-9 text-center text-sm font-bold text-muted">#{entry.position}</span>
                  <Avatar slug={entry.avatar_slug} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      @{entry.username}
                      {entry.is_you ? <span className="ml-2 text-xs text-muted">you</span> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {entry.elo} ELO · {entry.matches_won} wins · {entry.coins.toLocaleString()} coins
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <RankBadge rank={{ name: entry.rank_name }} size="sm" />
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
