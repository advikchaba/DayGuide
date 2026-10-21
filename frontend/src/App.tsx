import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { LandingPage } from './pages/LandingPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ProfilePage } from './pages/ProfilePage'
import { RoutineBuilderPage } from './pages/RoutineBuilderPage'
import { RoutinePage } from './pages/RoutinePage'
import { ShopPage } from './pages/ShopPage'
import { SignupPage } from './pages/SignupPage'
import { useAuth } from './state/AuthContext'
import { useTheme } from './state/ThemeContext'

/**
 * Email confirmation links can land on the site root with `?code=...` when the
 * configured Supabase redirect falls back to the Site URL. Send those to the
 * callback route, and keep signed-in users out of the public landing page.
 */
function RootPage() {
  const { profile, loading } = useAuth()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const hash = location.hash
  const hasAuthParams =
    params.has('code') ||
    params.has('error') ||
    params.has('error_description') ||
    params.has('token_hash') ||
    hash.includes('access_token=') ||
    hash.includes('error=')

  if (hasAuthParams) {
    return <Navigate to={`/auth/callback${location.search}${hash}`} replace />
  }
  if (!loading && profile) {
    return <Navigate to={profile.username ? '/app' : '/onboarding'} replace />
  }
  return <LandingPage />
}

/** Keeps the visual theme in sync with the theme the account has equipped. */
function ThemeSync() {
  const { profile } = useAuth()
  const { setTheme, themeSlug } = useTheme()

  useEffect(() => {
    if (profile?.theme_slug && profile.theme_slug !== themeSlug) {
      setTheme(profile.theme_slug)
    }
    // Only react to the account theme, not to local previews.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.theme_slug])

  return null
}

export default function App() {
  return (
    <>
      <ThemeSync />
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />

        {/* Authenticated app */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/app" element={<RoutinePage />} />
          <Route path="/dashboard" element={<Navigate to="/app" replace />} />
          <Route path="/routines/new" element={<RoutineBuilderPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
