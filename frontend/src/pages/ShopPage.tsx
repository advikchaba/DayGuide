import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, CoinPill, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { getTheme } from '../lib/themes'
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
      setTheme(item.slug)
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
      setShop((current) =>
        current
          ? {
              ...current,
              coins: me.coins,
              items: current.items.map((existing) => ({
                ...existing,
                equipped: existing.slug === item.slug,
              })),
            }
          : current,
      )
      setTheme(item.slug)
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

  const items = shop.items.filter((item) => item.kind === 'theme')

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Shop"
        subtitle="Spend your coins on themes. Free themes are already yours. Upload a custom profile picture from your profile."
        action={<CoinPill coins={profile?.coins ?? shop.coins} />}
      />

      {mode === 'dev' ? (
        <div className="flex justify-end">
          <Button variant="coin" size="sm" onClick={handleDevGrant}>
            Dev: +10,000 coins
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const theme = getTheme(item.slug)
          const isEquipped = profile?.theme_slug === item.slug
          const affordable = (profile?.coins ?? 0) >= item.price
          const background = theme.vars['--bg'] ?? item.meta.accent ?? '#101011'
          const surface = theme.vars['--surface'] ?? '#1a1a1d'
          const primary = theme.vars['--accent'] ?? item.meta.accent ?? '#dcdcdc'
          const secondary = theme.vars['--accent-2'] ?? item.meta.accent2 ?? '#d3d3d3'
          const swatches = [background, surface, primary, secondary]

          return (
            <Card key={item.slug} className="flex flex-col gap-3">
              {/* Preview */}
              <div className="relative h-36 overflow-hidden rounded-lg" style={{ background }}>
                {theme.image ? (
                  <>
                    <img
                      src={theme.image}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: theme.imagePosition ?? 'center' }}
                      loading="lazy"
                    />
                    <span className="absolute inset-x-0 bottom-0 h-20 bg-black/55" aria-hidden />
                  </>
                ) : (
                  <>
                    <span className="absolute inset-y-0 left-0 w-2/3" style={{ background: surface }} aria-hidden />
                    <span className="absolute inset-y-0 right-0 w-1/3" style={{ background: primary }} aria-hidden />
                    <span
                      className="absolute left-5 top-4 text-3xl font-black"
                      style={{ color: theme.vars['--text'] }}
                      aria-hidden
                    >
                      Aa
                    </span>
                    <span
                      className="absolute bottom-6 left-5 h-1.5 w-16 rounded-full"
                      style={{ background: secondary }}
                      aria-hidden
                    />
                  </>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
                  <span className="rounded bg-black/55 px-2 py-1 text-xs font-bold text-white">{theme.name}</span>
                  <span className="flex gap-1" aria-hidden>
                    {swatches.map((color, index) => (
                      <span key={`${item.slug}-${index}`} className="h-5 w-5 rounded" style={{ background: color }} />
                    ))}
                  </span>
                </div>
                {isEquipped ? (
                  <span className="absolute right-2 top-2">
                    <Badge tone="success">equipped</Badge>
                  </span>
                ) : null}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">{item.name}</h3>
                  <Badge tone={RARITY_TONES[item.rarity]}>{item.rarity}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{item.description}</p>
                {theme.imageCredit ? (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    Artwork: {theme.imageCredit}
                  </p>
                ) : null}
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
                  isEquipped ? (
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
          <li>Coins for every task checked in on time</li>
          <li>Up to +50 ELO for accurate timing, down to -30 for missing the window</li>
          <li>+200 coins for a perfect routine, plus streak bonuses</li>
          <li>Un-ticking a task reverses its coins and ELO</li>
        </ul>
      </Card>

      {profile ? (
        <p className="text-xs text-muted">Currently using {getTheme(profile.theme_slug).name}.</p>
      ) : null}
    </div>
  )
}
