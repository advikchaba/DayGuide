import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/api'
import {
  getAuthMode,
  loadAuthConfig,
  onAuthChange,
  getAuthToken,
  signInWithEmail as authSignIn,
  signInWithGoogle as authGoogle,
  signOut as authSignOut,
  signUpWithEmail as authSignUp,
  type AuthMode,
} from '../lib/authClient'
import type { Profile } from '../lib/types'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  mode: AuthMode
  refresh: () => Promise<Profile | null>
  applyProfile: (profile: Profile) => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username?: string) => Promise<{ needsEmailConfirmation: boolean }>
  signInWithGoogle: (redirectPath?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AuthMode>('dev')
  const mounted = useRef(true)

  const refresh = useCallback(async (): Promise<Profile | null> => {
    const token = await getAuthToken()
    if (!token) {
      if (mounted.current) setProfile(null)
      return null
    }
    try {
      const me = await api.get<Profile>('/me')
      if (mounted.current) setProfile(me)
      return me
    } catch {
      // 401 means the token is stale/revoked - drop it so the UI can react.
      if (mounted.current) setProfile(null)
      return null
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    let cancelled = false

    ;(async () => {
      const resolvedMode = await loadAuthConfig()
      if (cancelled) return
      setMode(resolvedMode)
      await refresh()
      if (!cancelled) setLoading(false)
    })()

    const unsubscribe = onAuthChange(() => {
      void refresh()
    })

    return () => {
      cancelled = true
      mounted.current = false
      unsubscribe()
    }
  }, [refresh])

  const signIn = useCallback(
    async (email: string, password: string) => {
      await authSignIn({ email, password })
      await refresh()
    },
    [refresh],
  )

  const signUp = useCallback(
    async (email: string, password: string, username?: string) => {
      const result = await authSignUp({ email, password, username })
      if (!result.needsEmailConfirmation) await refresh()
      return { needsEmailConfirmation: result.needsEmailConfirmation }
    },
    [refresh],
  )

  const signInWithGoogle = useCallback(async (redirectPath = '/dashboard') => {
    await authGoogle(redirectPath)
  }, [])

  const signOut = useCallback(async () => {
    await authSignOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      profile,
      loading,
      mode: mode ?? getAuthMode(),
      refresh,
      applyProfile: (next: Profile) => setProfile(next),
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [profile, loading, mode, refresh, signIn, signUp, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
