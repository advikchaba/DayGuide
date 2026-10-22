import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../state/AuthContext'
import { SessionLoading } from './SessionLoading'

/**
 * Keeps signed-in users out of the login/signup screens. Without this, a
 * returning user who opens `/login` from a bookmark sees the form again even
 * though their Supabase session is still valid.
 */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) return <SessionLoading />
  if (profile) {
    return <Navigate to={profile.username ? '/app' : '/onboarding'} replace />
  }
  return <>{children}</>
}
