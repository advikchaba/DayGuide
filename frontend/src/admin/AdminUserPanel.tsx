import { useCallback, useEffect, useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  SectionTitle,
  Spinner,
  Stat,
} from '../components/ui'
import { api, ApiError } from '../lib/api'
import { localDateString } from '../lib/time'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { AdminEconomy } from './AdminEconomy'
import { AdminReports } from './AdminReports'
import { AdminRoutines } from './AdminRoutines'
import { AdminShop } from './AdminShop'
import type { AdminUserDetail } from './types'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function DeleteAccount({
  user,
  onDeleted,
}: {
  user: AdminUserDetail['user']
  onDeleted: (userId: string) => Promise<void>
}) {
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)

  const matches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase()

  const handleDelete = async () => {
    if (!matches) {
      push("Type the account's full email address to confirm deletion.", 'error')
      return
    }
    setDeleting(true)
    try {
      await api.del(`/admin/users/${user.id}`, { confirm_email: confirmEmail.trim() })
      push(`Account ${user.email} deleted.`, 'success')
      setOpen(false)
      await onDeleted(user.id)
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not delete that account.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className="space-y-4">
        <SectionTitle
          title="Delete account"
          subtitle="This action cannot be undone from the dashboard."
          action={<Badge tone="danger">Warning</Badge>}
        />
        <p className="text-sm text-muted">
          Deleting this account removes its profile, routines, tasks, reports, purchases and ledger.
          The sign-in identity is deleted too, so the same email address can create a new account.
          Existing data is not restored.
        </p>
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </Card>

      <Modal
        open={open}
        onClose={() => {
          if (!deleting) {
            setOpen(false)
            setConfirmEmail('')
          }
        }}
        title="Permanently delete this account?"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={deleting}
              onClick={() => {
                setOpen(false)
                setConfirmEmail('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleting}
              disabled={!matches}
              onClick={handleDelete}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            You are about to delete <strong>{user.username ? `@${user.username}` : user.email}</strong>{' '}
            ({user.email}). This removes the account and its history immediately.
          </p>
          <p>
            After deletion, the person can sign up again with the same email. Their old routines,
            coins, ELO and purchases will not return.
          </p>
          <Field
            label="Type the account email to confirm"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            autoComplete="off"
            placeholder={user.email}
          />
        </div>
      </Modal>
    </>
  )
}

export function AdminUserPanel({
  userId,
  onChanged,
  onDeleted,
}: {
  userId: string
  onChanged: () => Promise<void>
  onDeleted: (userId: string) => Promise<void>
}) {
  const { profile: currentAdmin, refresh } = useAuth()
  const { push } = useToast()
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true)
      try {
        const next = await api.get<AdminUserDetail>(
          `/admin/users/${userId}?local_date=${localDateString()}`,
        )
        setDetail(next)
        setFailed(false)
        if (userId === currentAdmin?.id) await refresh()
      } catch (error) {
        if (showSpinner) setDetail(null)
        setFailed(true)
        push(error instanceof ApiError ? error.detail : 'Could not load that account.', 'error')
      } finally {
        if (showSpinner) setLoading(false)
      }
    },
    [currentAdmin?.id, push, refresh, userId],
  )

  useEffect(() => {
    void load(true)
  }, [load])

  const handleChanged = async () => {
    await Promise.all([load(false), onChanged()])
  }

  if (loading && !detail) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <Spinner /> Loading account…
      </div>
    )
  }

  if (!detail) {
    return (
      <EmptyState
        title="Account could not be loaded"
        body={failed ? 'The account may have been deleted, or the API did not answer.' : 'No account data is available.'}
        action={
          <Button type="button" onClick={() => load(true)}>
            Try again
          </Button>
        }
      />
    )
  }

  const user = detail.user

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar slug={user.avatar_slug} src={user.avatar_url} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-2xl">
                {user.username ? `@${user.username}` : 'Unnamed account'}
              </h2>
              {user.is_admin ? <Badge tone="gold">Administrator</Badge> : null}
              {user.id === currentAdmin?.id ? <Badge tone="neutral">This is you</Badge> : null}
            </div>
            <p className="break-all text-sm text-muted">{user.email}</p>
            <p className="mt-1 break-all text-[11px] text-muted">ID {user.id}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => load(true)}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Coins" value={user.coins.toLocaleString()} />
          <Stat label="ELO" value={user.elo.toLocaleString()} />
          <Stat label="Current streak" value={user.streak} hint={`Best ${user.best_streak}`} />
          <Stat label="Routines" value={user.routines_count} hint={`${user.tasks_count} tasks`} />
          <Stat label="Tasks completed" value={user.tasks_completed.toLocaleString()} />
          <Stat label="Account created" value={formatDate(user.created_at)} />
        </div>
      </Card>

      <AdminEconomy user={user} onChanged={handleChanged} />

      <AdminRoutines
        userId={user.id}
        routines={detail.routines}
        onChanged={handleChanged}
      />

      <AdminReports userId={user.id} />

      <AdminShop
        userId={user.id}
        items={detail.shop}
        purchases={detail.purchases}
        onChanged={handleChanged}
      />

      <Card className="space-y-4">
        <SectionTitle
          title="Recent ledger"
          subtitle="The latest coin and ELO movements, including administrator changes."
        />
        {detail.ledger.length === 0 ? (
          <p className="text-sm text-muted">No ledger entries yet.</p>
        ) : (
          <div className="space-y-2">
            {detail.ledger.map((entry) => {
              const parts: string[] = []
              if (entry.delta) parts.push(`${entry.delta > 0 ? '+' : ''}${entry.delta} coins`)
              if (entry.elo_delta) parts.push(`${entry.elo_delta > 0 ? '+' : ''}${entry.elo_delta} ELO`)
              return (
                <div
                  key={entry.id}
                  className="glass-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{entry.reason}</p>
                    <p className="text-[11px] text-muted">{formatDate(entry.created_at)}</p>
                  </div>
                  <span className="text-xs font-bold text-muted">
                    {parts.length ? parts.join(' · ') : 'No balance change'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <DeleteAccount user={user} onDeleted={onDeleted} />
    </div>
  )
}
