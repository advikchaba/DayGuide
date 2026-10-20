import { Modal } from './ui'
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
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">Reward</p>
        <h3 className="mt-2 text-2xl">
          {isNegative ? 'Rewards reverted' : isPerfect ? 'Routine complete' : title}
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
              'rounded-lg px-5 py-3 text-2xl font-bold',
              reward.coins >= 0 ? 'bg-amber-400/15 text-amber-200' : 'bg-rose-500/15 text-rose-200',
            ].join(' ')}
          >
            {reward.coins >= 0 ? '+' : ''}
            {reward.coins.toLocaleString()} coins
          </span>
          {reward.elo !== 0 ? (
            <span
              className={[
                'rounded-lg px-5 py-3 text-2xl font-bold',
                reward.elo > 0 ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200',
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
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
            <span>New balance</span>
            <span>{reward.new_balance.toLocaleString()} coins</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
            <span>New ELO</span>
            <span>{reward.new_elo}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {reward.streak > 0 ? `${reward.streak} day perfect streak` : 'Complete a routine perfectly to start a streak'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="focus-ring accent-button w-full rounded-lg px-4 py-3 text-sm font-bold"
        >
          Keep going
        </button>
      </div>
    </Modal>
  )
}
