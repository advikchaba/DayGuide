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
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null)

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
        subtitle="The administration dashboard is limited to accounts allowlisted by the API."
        action={<Badge tone="danger">Not authorised</Badge>}
      />

      <Card className="space-y-4">
        <p className="text-sm text-muted">
          You are signed in as <strong className="text-ink">{email}</strong>. This account is not on
          the administrator list, so the server will not expose account, economy, routine, report or
          shop controls.
        </p>

        {adminConfigured === false ? (
          <div className="glass-2 space-y-2 p-4">
            <p className="text-sm font-bold">No administrator is configured on this deployment.</p>
            <p className="text-sm text-muted">
              On Vercel, open the DayGuide backend service settings and add this environment
              variable, then redeploy:
            </p>
            <code className="block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink">
              ADMIN_EMAILS={email}
            </code>
          </div>
        ) : null}

        {adminConfigured === true ? (
          <div className="glass-2 space-y-2 p-4">
            <p className="text-sm font-bold">Administrator access is configured.</p>
            <p className="text-sm text-muted">
              Ask the site owner to add <strong className="text-ink">{email}</strong> to the
              comma-separated <code>ADMIN_EMAILS</code> API variable, then sign out and back in.
            </p>
          </div>
        ) : null}

        <p className="text-xs text-muted">
          Changing <code>ADMIN_EMAILS</code> requires a new backend deployment. The frontend guard is
          only a convenience; every administrator route is checked again on the server.
        </p>

        <Button type="button" onClick={() => navigate('/app')}>
          Back to routine
        </Button>
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
