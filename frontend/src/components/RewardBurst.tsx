import { Modal, ProgressBar } from './ui'
import type { Reward } from '../lib/types'

/**
 * The celebration shown after a task, a perfect routine or a ranked win.
 */
export function RewardBurst({
  reward,
  open,
  onClose,
  title = 'Rewards earned',
}: {
  reward: Reward | null
  open: boolean
  onClose: () => void
  title?: string
}) {
  if (!reward) return null

  const isPerfect = reward.perfect
  const isNegative = reward.coins < 0

  return (
    <Modal open={open} onClose={onClose} width="max-w-md">
      <div className="text-center">
        <div className={`mx-auto mb-3 text-5xl ${isPerfect ? 'animate-float' : ''}`} aria-hidden>
          {isNegative ? '↩️' : isPerfect ? '🎉' : '🪙'}
        </div>
        <h3 className="text-xl font-extrabold">
          {isNegative ? 'Rewards reverted' : isPerfect ? 'Routine complete!' : title}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {isPerfect
            ? 'Every task in your routine is done. That is how the ladder is climbed.'
            : isNegative
              ? 'Un-ticking a task takes its coins back, so the economy stays honest.'
              : 'Nice. Keep the streak alive.'}
        </p>

        <div className="my-5 flex items-center justify-center gap-3">
          <span
            className={[
              'rounded-2xl border px-5 py-3 text-2xl font-black',
              reward.coins >= 0
                ? 'border-amber-300/40 bg-amber-400/15 text-amber-100'
                : 'border-rose-400/40 bg-rose-500/15 text-rose-100',
            ].join(' ')}
          >
            {reward.coins >= 0 ? '+' : ''}
            {reward.coins.toLocaleString()} 🪙
          </span>
          {reward.elo !== 0 ? (
            <span
              className={[
                'rounded-2xl border px-5 py-3 text-2xl font-black',
                reward.elo > 0
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                  : 'border-rose-400/40 bg-rose-500/15 text-rose-100',
              ].join(' ')}
            >
              {reward.elo > 0 ? '+' : ''}
              {reward.elo} ELO
            </span>
          ) : null}
        </div>

        {reward.messages.length > 0 ? (
          <ul className="mb-4 space-y-1 text-xs text-muted">
            {reward.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}

        <div className="glass-2 mb-5 px-4 py-3 text-left">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
            <span>{reward.rank_name}</span>
            <span>{reward.new_elo} ELO</span>
          </div>
          <ProgressBar value={reward.rank_progress * 100} />
          <p className="mt-2 text-xs text-muted">
            {reward.streak > 0 ? `🔥 ${reward.streak} day perfect streak` : 'Complete a routine perfectly to start a streak'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="focus-ring accent-button w-full rounded-xl px-4 py-3 text-sm font-bold"
        >
          Keep going
        </button>
      </div>
    </Modal>
  )
}
