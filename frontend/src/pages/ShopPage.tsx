import { useCallback, useEffect, useState } from 'react'
import { Avatar, Badge, Button, Card, CoinPill, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { getAvatar, getTheme } from '../lib/themes'
import type { Profile, ShopItem, ShopPayload } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useTheme } from '../state/ThemeContext'
import { useToast } from '../state/ToastContext'

const RARITY_TONES = {
  common: 'neutral',
  rare: 'accent',
  epic: 'gold',
} as const

export function ShopPage() {
  const { profile, refresh, applyProfile, mode } = useAuth()
  const { setTheme } = useTheme()
  const { push } = useToast()

  const [tab, setTab] = useState<'theme' | 'avatar'>('theme')
  const [shop, setShop] = useState<ShopPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busySlug, setBusySlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setShop(await api.get<ShopPayload>('/shop'))
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not load the shop.', 'error')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  const handleBuy = async (item: ShopItem) => {
    setBusySlug(item.slug)
    try {
      const updated = await api.post<ShopPayload>(`/shop/${item.slug}/buy`)
      setShop(updated)
      if (item.kind === 'theme') setTheme(item.slug)
      push(`Unlocked ${item.name}.`, 'success')
      const me = await refresh()
      if (me) applyProfile(me)
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Purchase failed.', 'error')
    } finally {
      setBusySlug(null)
    }
  }

  const handleEquip = async (item: ShopItem) => {
    setBusySlug(item.slug)
    try {
      const me = await api.post<Profile>(`/shop/${item.slug}/equip`)
      applyProfile(me)
      if (item.kind === 'theme') setTheme(item.slug)
      push(`${item.name} equipped.`, 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not equip that item.', 'error')
    } finally {
      setBusySlug(null)
    }
  }

  const handleDevGrant = async () => {
    try {
      const me = await api.post<Profile>('/auth/dev/grant', { coins: 10_000, elo: 0 })
      applyProfile(me)
      await load()
      push('+10,000 test coins added.', 'coins')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Dev grant failed.', 'error')
    }
  }

  if (loading || !shop) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Opening the shop…
      </div>
    )
  }

  const items = shop.items.filter((item) => item.kind === tab)
  const currentAvatar = getAvatar(profile?.avatar_slug)

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Shop"
        subtitle="Spend your coins on themes and profile pictures. Free items are already yours."
        action={<CoinPill coins={profile?.coins ?? shop.coins} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(['theme', 'avatar'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setTab(kind)}
            className={[
              'focus-ring rounded-lg px-4 py-2 text-sm font-bold transition',
              tab === kind ? 'bg-surface-2 text-ink' : 'bg-surface text-muted hover:text-ink',
            ].join(' ')}
          >
            {kind === 'theme' ? 'Themes' : 'Profile pictures'}
          </button>
        ))}

        {mode === 'dev' ? (
          <Button variant="coin" size="sm" className="ml-auto" onClick={handleDevGrant}>
            Dev: +10,000 coins
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const theme = getTheme(item.slug)
          const avatar = getAvatar(item.slug)
          const affordable = (profile?.coins ?? 0) >= item.price
          const primary = theme.vars['--accent'] ?? item.meta.accent ?? '#dcdcdc'
          const secondary = theme.vars['--accent-2'] ?? item.meta.accent2 ?? '#d3d3d3'

          return (
            <Card key={item.slug} className="flex flex-col gap-3">
              {/* Preview */}
              {item.kind === 'theme' ? (
                <div className="relative h-28 overflow-hidden rounded-lg" style={{ background: primary }}>
                  {theme.image ? (
                    <img
                      src={theme.image}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-40"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
                    <span className="rounded bg-black/35 px-2 py-1 text-xs font-bold text-white">{theme.name}</span>
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-6 w-6 rounded" style={{ background: primary }} />
                      <span className="h-6 w-6 rounded" style={{ background: secondary }} />
                    </span>
                  </div>
                  {item.equipped ? (
                    <span className="absolute right-2 top-2">
                      <Badge tone="success">equipped</Badge>
                    </span>
                  ) : null}
                </div>
              ) : (
                <div
                  className="relative grid h-28 place-items-center overflow-hidden rounded-lg"
                  style={{ background: `color-mix(in srgb, ${avatar.accent} 20%, var(--surface-2))` }}
                >
                  <span className="text-3xl font-black" style={{ color: avatar.accent }}>
                    {avatar.initials}
                  </span>
                  {item.equipped ? (
                    <span className="absolute right-2 top-2">
                      <Badge tone="success">equipped</Badge>
                    </span>
                  ) : null}
                </div>
              )}

              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">{item.name}</h3>
                  <Badge tone={RARITY_TONES[item.rarity]}>{item.rarity}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{item.description}</p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">
                  {item.is_free ? (
                    <span className="text-emerald-300">Free</span>
                  ) : (
                    <>{item.price.toLocaleString()} coins</>
                  )}
                </span>

                {item.owned ? (
                  item.equipped ? (
                    <Button size="sm" variant="ghost" disabled>
                      In use
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" loading={busySlug === item.slug} onClick={() => handleEquip(item)}>
                      Equip
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    loading={busySlug === item.slug}
                    disabled={!affordable}
                    onClick={() => handleBuy(item)}
                    title={affordable ? undefined : 'Not enough coins yet'}
                  >
                    {affordable ? 'Unlock' : `Need ${(item.price - (profile?.coins ?? 0)).toLocaleString()} more`}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="text-sm text-muted">
        <p className="font-bold text-ink">How to earn coins</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <li>+10 coins per task you complete</li>
          <li>+25 coins when a photo is verified (+10 bonus for clear proof)</li>
          <li>+200 coins for a perfect routine, plus streak bonuses</li>
          <li>+200 coins for winning a ranked race</li>
        </ul>
      </Card>

      {profile ? (
        <div className="flex items-center gap-3 text-xs text-muted">
          <Avatar slug={profile.avatar_slug} size={28} /> Currently using {getTheme(profile.theme_slug).name} and{' '}
          {currentAvatar.name}
        </div>
      ) : null}
    </div>
  )
}
