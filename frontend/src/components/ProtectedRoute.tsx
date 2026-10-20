import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../state/AuthContext'
import { Spinner } from './ui'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="app-shell grid min-h-screen place-items-center">
        <div className="app-content flex items-center gap-3 text-muted">
          <Spinner />
          Loading your routine…
        </div>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // First login: the user picks the username that is theirs forever (free once).
  if (!profile.username && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
