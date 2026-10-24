import type { LedgerEntry, Profile, Routine, ShopItem } from '../lib/types'

export interface AdminUserSummary {
  id: string
  email: string
  username: string | null
  coins: number
  elo: number
  avatar_slug: string
  avatar_url: string | null
  created_at: string
  streak: number
  best_streak: number
  routines_count: number
  tasks_count: number
  is_admin: boolean
}

export interface AdminUserList {
  items: AdminUserSummary[]
  total: number
  page: number
  page_size: number
}

export interface AdminPurchase {
  slug: string
  name: string
  kind: string
  price_paid: number
  created_at: string
  equipped: boolean
}

export interface AdminUserDetail {
  user: Profile & AdminUserSummary
  routines: Routine[]
  shop: ShopItem[]
  purchases: AdminPurchase[]
  ledger: LedgerEntry[]
  local_date: string
}
