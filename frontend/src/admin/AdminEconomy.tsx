import { useEffect, useState } from 'react'
import { Button, Card, Field, SectionTitle } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useToast } from '../state/ToastContext'
import type { AdminUserSummary } from './types'

type EconomyAction = 'grant-coins' | 'set-coins' | 'grant-elo' | 'set-elo'

function wholeNumber(value: string, minimum: number): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum) return null
  return parsed
}

export function AdminEconomy({
  user,
  onChanged,
}: {
  user: AdminUserSummary
  onChanged: () => Promise<void>
}) {
  const { push } = useToast()
  const [grantCoins, setGrantCoins] = useState('')
  const [setCoins, setSetCoins] = useState(String(user.coins))
  const [grantElo, setGrantElo] = useState('')
  const [setElo, setSetElo] = useState(String(user.elo))
  const [busy, setBusy] = useState<EconomyAction | null>(null)

  useEffect(() => {
    setSetCoins(String(user.coins))
    setSetElo(String(user.elo))
  }, [user.id, user.coins, user.elo])

  const apply = async (
    action: EconomyAction,
    path: string,
    body: Record<string, number>,
    success: string,
  ): Promise<boolean> => {
    setBusy(action)
    try {
      await api.post(path, body)
      push(success, 'success')
      await onChanged()
      return true
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not update that balance.', 'error')
      return false
    } finally {
      setBusy(null)
    }
  }

  const handleCoinGrant = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = wholeNumber(grantCoins, 1)
    if (amount === null) {
      push('Enter a whole number of at least 1 coin to grant.', 'error')
      return
    }
    const granted = await apply(
      'grant-coins',
      `/admin/users/${user.id}/coins/grant`,
      { amount },
      `Granted ${amount.toLocaleString()} coins.`,
    )
    if (granted) setGrantCoins('')
  }

  const handleCoinSet = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = wholeNumber(setCoins, 0)
    if (amount === null) {
      push('Coin balances cannot be negative. Enter 0 or more.', 'error')
      return
    }
    await apply(
      'set-coins',
      `/admin/users/${user.id}/coins/set`,
      { amount },
      `Coin balance set to ${amount.toLocaleString()}.`,
    )
  }

  const handleEloGrant = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = wholeNumber(grantElo, 1)
    if (amount === null) {
      push('Enter a whole number of at least 1 ELO to grant.', 'error')
      return
    }
    const granted = await apply(
      'grant-elo',
      `/admin/users/${user.id}/elo/grant`,
      { amount },
      `Granted ${amount.toLocaleString()} ELO.`,
    )
    if (granted) setGrantElo('')
  }

  const handleEloSet = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = wholeNumber(setElo, 100)
    if (amount === null) {
      push('ELO cannot be lower than 100. Enter 100 or more.', 'error')
      return
    }
    await apply(
      'set-elo',
      `/admin/users/${user.id}/elo/set`,
      { amount },
      `ELO set to ${amount.toLocaleString()}.`,
    )
  }

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Coins and ELO"
        subtitle="Grants add to the current balance. Set replaces the balance outright."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-2 space-y-4 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Coins</p>
              <p className="mt-1 text-2xl font-bold">{user.coins.toLocaleString()}</p>
            </div>
            <span className="text-xs text-muted">Minimum 0</span>
          </div>

          <form onSubmit={handleCoinGrant} className="space-y-2">
            <Field
              label="Grant coins"
              hint="Added to balance"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={grantCoins}
              onChange={(event) => setGrantCoins(event.target.value)}
              placeholder="1000"
            />
            <Button type="submit" variant="coin" size="sm" loading={busy === 'grant-coins'} full>
              Grant coins
            </Button>
          </form>

          <form onSubmit={handleCoinSet} className="space-y-2">
            <Field
              label="Set coins to"
              hint="Replaces balance"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={setCoins}
              onChange={(event) => setSetCoins(event.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm" loading={busy === 'set-coins'} full>
              Set coin balance
            </Button>
          </form>
        </div>

        <div className="glass-2 space-y-4 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">ELO</p>
              <p className="mt-1 text-2xl font-bold">{user.elo.toLocaleString()}</p>
            </div>
            <span className="text-xs text-muted">Minimum 100</span>
          </div>

          <form onSubmit={handleEloGrant} className="space-y-2">
            <Field
              label="Grant ELO"
              hint="Added to balance"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={grantElo}
              onChange={(event) => setGrantElo(event.target.value)}
              placeholder="250"
            />
            <Button type="submit" size="sm" loading={busy === 'grant-elo'} full>
              Grant ELO
            </Button>
          </form>

          <form onSubmit={handleEloSet} className="space-y-2">
            <Field
              label="Set ELO to"
              hint="Replaces balance"
              type="number"
              inputMode="numeric"
              min={100}
              step={1}
              value={setElo}
              onChange={(event) => setSetElo(event.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm" loading={busy === 'set-elo'} full>
              Set ELO
            </Button>
          </form>
        </div>
      </div>

      <p className="text-xs text-muted">
        Every change is written to the user&apos;s ledger. An ELO grant may move the account anywhere
        on the ladder; setting ELO below 100 is refused by the API.
      </p>
    </Card>
  )
}
