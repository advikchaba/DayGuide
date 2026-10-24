import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { SessionLoading } from '../components/SessionLoading'
import { Badge, Button, Card, SectionTitle } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../state/AuthContext'

interface AdminConfig {
  admin_configured: boolean
}

function AdminAccessPage({ email }: { email: string }) {
  const navigate = useNavigate()
  const { refreshSession } = useAuth()
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const next = await refreshSession()
      if (!next?.is_admin) {
        setRefreshError(
          'This account still has no administrator role. Ask the site owner to grant it, then refresh again.',
        )
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Could not refresh the session.')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true
    api
      .public<AdminConfig>('/config')
      .then((config) => {
        if (active) setAdminConfigured(config.admin_configured)
      })
      .catch(() => {
        if (active) setAdminConfigured(null)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SectionTitle
        title="Administrator access required"
        subtitle="The administration dashboard is limited to accounts approved by the API."
        action={<Badge tone="danger">Not authorised</Badge>}
      />

      <Card className="space-y-4">
        <p className="text-sm text-muted">
          You are signed in as <strong className="text-ink">{email}</strong>. This account does not
          have an administrator role, so the server will not expose account, economy, routine,
          report or shop controls.
        </p>

        {adminConfigured === false ? (
          <div className="glass-2 space-y-2 p-4">
            <p className="text-sm font-bold">No email allowlist is configured on this deployment.</p>
            <p className="text-sm text-muted">
              The owner can either add this email to the API&apos;s comma-separated{' '}
              <code>ADMIN_EMAILS</code> variable and redeploy, or grant this Supabase account the
              server-controlled <code>app_metadata.role = &quot;admin&quot;</code> role.
            </p>
            <code className="block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink">
              ADMIN_EMAILS={email}
            </code>
          </div>
        ) : null}

        {adminConfigured === true ? (
          <div className="glass-2 space-y-2 p-4">
            <p className="text-sm font-bold">An email allowlist is configured.</p>
            <p className="text-sm text-muted">
              This account is not on it. Ask the owner to add{' '}
              <strong className="text-ink">{email}</strong>, or to grant the Supabase administrator
              role, then choose Refresh access.
            </p>
          </div>
        ) : null}

        {refreshError ? (
          <p className="text-sm font-bold text-danger" role="alert">
            {refreshError}
          </p>
        ) : null}

        <p className="text-xs text-muted">
          Administrator access is checked again on every API request. Refreshing a session picks up
          a newly granted role without waiting for the token to expire.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" loading={refreshing} onClick={handleRefresh}>
            Refresh access
          </Button>
          <Button type="button" onClick={() => navigate('/app')}>
            Back to routine
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** Convenience guard. The API still enforces admin access on every request. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) return <SessionLoading label="Checking administrator access" />
  if (!profile) return <Navigate to="/login" replace />
  if (!profile.is_admin) return <AdminAccessPage email={profile.email} />

  return <>{children}</>
}
