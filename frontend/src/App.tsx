import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
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
        <Route path="/" element={<LandingPage />} />
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
