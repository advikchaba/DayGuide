import { useState } from 'react'
import { Badge, Button, Card, SectionTitle } from '../components/ui'
import { api, ApiError } from '../lib/api'
import type { ShopItem } from '../lib/types'
import { useToast } from '../state/ToastContext'
import type { AdminPurchase } from './types'

export function AdminShop({
  userId,
  items,
  purchases,
  onChanged,
}: {
  userId: string
  items: ShopItem[]
  purchases: AdminPurchase[]
  onChanged: () => Promise<void>
}) {
  const { push } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const purchaseMap = new Map(purchases.map((purchase) => [purchase.slug, purchase]))
  const shopSlugs = new Set(items.map((item) => item.slug))
  const retired = purchases.filter((purchase) => !shopSlugs.has(purchase.slug))

  const grant = async (item: ShopItem) => {
    setBusy(`grant:${item.slug}`)
    try {
      await api.post(`/admin/users/${userId}/items/${item.slug}/grant`)
      push(`${item.name} granted without changing coins.`, 'success')
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not grant that item.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (slug: string, name: string) => {
    setBusy(`remove:${slug}`)
    try {
      await api.del(`/admin/users/${userId}/items/${slug}`)
      push(`${name} removed from the account.`, 'success')
      await onChanged()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not remove that item.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Shop inventory"
        subtitle="Grant owned items for free or remove purchased items. Coin balances are never changed here."
      />

      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((item) => {
          const purchase = purchaseMap.get(item.slug)
          return (
            <div key={item.slug} className="glass-2 flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{item.name}</span>
                  {item.equipped ? <Badge tone="success">Equipped</Badge> : null}
                  {purchase ? (
                    <Badge tone={purchase.price_paid === 0 ? 'gold' : 'neutral'}>
                      {purchase.price_paid === 0 ? 'Granted' : 'Purchased'}
                    </Badge>
                  ) : item.is_free ? (
                    <Badge tone="neutral">Free</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {item.description}
                </p>
                <p className="mt-1 text-[11px] font-bold text-muted">
                  {item.is_free ? 'Free for every account' : `${item.price.toLocaleString()} coin value`}
                </p>
              </div>

              {purchase ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  loading={busy === `remove:${item.slug}`}
                  onClick={() => remove(item.slug, item.name)}
                >
                  Remove item
                </Button>
              ) : item.is_free ? (
                <span className="text-xs text-muted">Always available</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  loading={busy === `grant:${item.slug}`}
                  onClick={() => grant(item)}
                >
                  Grant item
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {retired.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Retired purchases
          </p>
          {retired.map((purchase) => (
            <div key={purchase.slug} className="glass-2 flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{purchase.name}</p>
                <p className="text-xs text-muted">Retired item · {purchase.slug}</p>
              </div>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={busy === `remove:${purchase.slug}`}
                onClick={() => remove(purchase.slug, purchase.name)}
              >
                Remove item
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted">
        Removing an equipped theme switches the account back to the default dark theme.
      </p>
    </Card>
  )
}
