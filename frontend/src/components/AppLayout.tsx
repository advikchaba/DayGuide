import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { useTheme } from '../state/ThemeContext'
import { Avatar, Button, CoinPill } from './ui'
import { Logo } from './Logo'

const LINKS = [
  { to: '/app', label: 'Routine' },
  { to: '/ranked', label: 'Ranked' },
  { to: '/shop', label: 'Shop' },
  { to: '/leaderboard', label: 'Ladder' },
  { to: '/profile', label: 'Profile' },
]

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
      setTheme('dark')
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        <header className="sticky top-0 z-40 bg-bg">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Logo />

            <nav className="ml-4 hidden items-center gap-1 md:flex">
              {LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    [
                      'focus-ring rounded-lg px-3 py-2 text-sm font-bold transition',
                      isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
                    ].join(' ')
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {profile ? (
                <>
                  <CoinPill coins={profile.coins} className="hidden sm:inline-flex" />
                  <span className="hidden text-xs font-bold text-muted sm:inline">{profile.elo} ELO</span>
                  <Link to="/profile" className="focus-ring rounded-lg">
                    <Avatar slug={profile.avatar_slug} size={38} />
                  </Link>
                  <Button variant="ghost" size="sm" onClick={handleSignOut} loading={busy} className="hidden md:inline-flex">
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="secondary" size="sm">
                      Log in
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="sm">Sign up free</Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile nav */}
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  [
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition',
                    isActive ? 'bg-surface-2 text-ink' : 'text-muted',
                  ].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6" data-theme-name={theme.name}>
          <Outlet />
        </main>

        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted">
          Routinery · Routines, coins, cosmetics and a ranked ladder. Theme: {theme.name}
        </footer>
      </div>
    </div>
  )
}
