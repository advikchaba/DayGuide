import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { SessionLoading } from '../components/SessionLoading'
import { useAuth } from '../state/AuthContext'

/** Convenience guard. The API still enforces admin access on every request. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) return <SessionLoading label="Checking administrator access" />
  if (!profile) return <Navigate to="/login" replace />
  if (!profile.is_admin) return <Navigate to="/app" replace />

  return <>{children}</>
}
