import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  Spinner,
  Stat,
} from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { AdminUserPanel } from './AdminUserPanel'
import type { AdminUserList, AdminUserSummary } from './types'

const PAGE_SIZE = 20

function UserRow({
  user,
  selected,
  onSelect,
}: {
  user: AdminUserSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition',
        selected ? 'bg-surface-2' : 'hover:bg-surface-2',
      ].join(' ')}
    >
      <Avatar slug={user.avatar_slug} src={user.avatar_url} size={38} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">
          {user.username ? `@${user.username}` : 'No username yet'}
        </span>
        <span className="block truncate text-xs text-muted">{user.email}</span>
        <span className="mt-1 block text-[11px] font-bold text-muted">
          {user.routines_count} routine{user.routines_count === 1 ? '' : 's'} · {user.tasks_count} task
          {user.tasks_count === 1 ? '' : 's'}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs font-bold">{user.coins.toLocaleString()} coins</span>
        <span className="block text-xs text-muted">{user.elo.toLocaleString()} ELO</span>
        {user.is_admin ? (
          <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-amber-200">Admin</span>
        ) : null}
      </span>
    </button>
  )
}

export function AdminDashboardPage() {
  const { profile, signOut } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const { userId } = useParams<{ userId?: string }>()

  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [users, setUsers] = useState<AdminUserList | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(query.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (appliedQuery) params.set('q', appliedQuery)
      setUsers(await api.get<AdminUserList>(`/admin/users?${params.toString()}`))
    } catch (error) {
      setUsers(null)
      push(error instanceof ApiError ? error.detail : 'Could not load the account list.', 'error')
    } finally {
      setLoading(false)
    }
  }, [appliedQuery, page, push])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const totalPages = users ? Math.max(1, Math.ceil(users.total / users.page_size)) : 1

  const handleDeleted = async (deletedId: string) => {
    if (deletedId === profile?.id) {
      await signOut()
      navigate('/')
      return
    }
    navigate('/admin')
    await loadUsers()
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Administration"
        subtitle="Search every DayGuide account, then open one to manage its balance, routines, reports and shop items."
        action={<Badge tone="neutral">{users ? `${users.total.toLocaleString()} accounts` : 'Accounts'}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,390px)_minmax(0,1fr)]">
        <Card className="space-y-4 self-start">
          <Field
            label="Search accounts"
            placeholder="Email, username or user id"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />

          {loading && !users ? (
            <div className="flex items-center gap-3 px-1 py-8 text-sm text-muted">
              <Spinner /> Loading accounts…
            </div>
          ) : null}

          {!loading && users && users.items.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted">
              No accounts match “{appliedQuery}”.
            </p>
          ) : null}

          {users && users.items.length > 0 ? (
            <div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
              {users.items.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  selected={user.id === userId}
                  onSelect={() => navigate(`/admin/users/${user.id}`)}
                />
              ))}
            </div>
          ) : null}

          {users && users.total > users.page_size ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-bold text-muted">
                Page {users.page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="min-w-0">
          {userId ? (
            <AdminUserPanel
              key={userId}
              userId={userId}
              onChanged={loadUsers}
              onDeleted={handleDeleted}
            />
          ) : (
            <EmptyState
              title="Choose an account"
              body="Select someone from the list to grant or set coins and ELO, edit routines, read reports, manage shop items, or delete the account."
            />
          )}
        </div>
      </div>

      {users ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Accounts shown" value={users.items.length} />
          <Stat
            label="Administrators"
            value={users.items.filter((user) => user.is_admin).length}
            hint="Only administrators in the current page"
          />
          <Stat label="Page size" value={users.page_size} hint="Use search to narrow the list" />
        </div>
      ) : null}
    </div>
  )
}
