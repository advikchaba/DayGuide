/**
 * Auth facade.
 *
 * Picks Supabase when it is configured, otherwise the backend's local dev
 * provider. Both paths expose the same API so the UI never branches on it.
 */
import {
  configureSupabase,
  getSupabaseSession,
  isSupabaseReady,
  onSupabaseAuthStateChange,
  signInWithEmail as supabaseSignIn,
  signInWithGoogle as supabaseGoogle,
  signOutSupabase,
  signUpWithEmail as supabaseSignUp,
} from './supabase'

const DEV_TOKEN_KEY = 'routinery.dev_token'
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export type AuthMode = 'supabase' | 'dev'

interface BackendConfig {
  supabase_url: string
  supabase_anon_key: string
  supabase_configured: boolean
  dev_auth: boolean
}

export interface SessionInfo {
  accessToken: string
  email: string
  userId: string
  pendingEmailConfirmation?: boolean
}

export interface AuthResult {
  session: SessionInfo | null
  /** true when the user must confirm their email before they can log in */
  needsEmailConfirmation: boolean
}

let mode: AuthMode = 'dev'
let configLoaded = false
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */
export async function loadAuthConfig(): Promise<AuthMode> {
  if (configLoaded) return mode

  let backendConfig: BackendConfig | null = null
  try {
    const response = await fetch(`${API_BASE}/api/config`)
    if (response.ok) backendConfig = (await response.json()) as BackendConfig
  } catch {
    backendConfig = null
  }

  if (!isSupabaseReady() && backendConfig?.supabase_configured) {
    configureSupabase(backendConfig.supabase_url, backendConfig.supabase_anon_key)
  }

  mode = isSupabaseReady() ? 'supabase' : 'dev'
  // Supabase is authoritative once configured - never revive a stale offline
  // token from a previous dev session.
  if (mode === 'supabase') localStorage.removeItem(DEV_TOKEN_KEY)
  configLoaded = true
  return mode
}

export function getAuthMode(): AuthMode {
  return mode
}

export function isDevAuth(): boolean {
  return mode === 'dev'
}

/* -------------------------------------------------------------------------- */
/* Dev-provider HTTP calls                                                    */
/* -------------------------------------------------------------------------- */
async function devRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/api/auth/dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : 'Local sign-in failed. Is the backend running on port 8000?'
    throw new Error(detail)
  }
  return payload as T
}

function storeDevToken(token: string | null): void {
  if (token) localStorage.setItem(DEV_TOKEN_KEY, token)
  else localStorage.removeItem(DEV_TOKEN_KEY)
  emit()
}

export function getDevToken(): string | null {
  return localStorage.getItem(DEV_TOKEN_KEY)
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */
export async function signUpWithEmail(params: {
  email: string
  password: string
  username?: string
}): Promise<AuthResult> {
  await loadAuthConfig()

  if (mode === 'supabase') {
    const session = await supabaseSignUp(params)
    if (!session) return { session: null, needsEmailConfirmation: false }
    if (session.pendingEmailConfirmation) {
      return { session: null, needsEmailConfirmation: true }
    }
    return {
      session: {
        accessToken: session.accessToken,
        email: session.user.email,
        userId: session.user.id,
      },
      needsEmailConfirmation: false,
    }
  }

  const payload = await devRequest<{ access_token: string; profile: { id: string; email: string } }>('/signup', {
    email: params.email,
    password: params.password,
    username: params.username ?? null,
  })
  storeDevToken(payload.access_token)
  return {
    session: { accessToken: payload.access_token, email: payload.profile.email, userId: payload.profile.id },
    needsEmailConfirmation: false,
  }
}

export async function signInWithEmail(params: { email: string; password: string }): Promise<AuthResult> {
  await loadAuthConfig()

  if (mode === 'supabase') {
    const session = await supabaseSignIn(params.email, params.password)
    return {
      session: { accessToken: session.accessToken, email: session.user.email, userId: session.user.id },
      needsEmailConfirmation: false,
    }
  }

  const payload = await devRequest<{ access_token: string; profile: { id: string; email: string } }>('/login', params)
  storeDevToken(payload.access_token)
  return {
    session: { accessToken: payload.access_token, email: payload.profile.email, userId: payload.profile.id },
    needsEmailConfirmation: false,
  }
}

export async function signInWithGoogle(redirectPath = '/dashboard'): Promise<void> {
  await loadAuthConfig()

  if (mode === 'supabase') {
    await supabaseGoogle(redirectPath)
    return
  }
  throw new Error(
    'Google sign-in needs Supabase. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the API (backend/.env locally, or the Vercel backend project) and redeploy.',
  )
}

export async function signOut(): Promise<void> {
  await loadAuthConfig()
  if (mode === 'supabase') {
    await signOutSupabase()
  }
  storeDevToken(null)
}

export async function getAuthToken(): Promise<string | null> {
  await loadAuthConfig()
  if (mode === 'supabase') {
    const session = await getSupabaseSession()
    return session?.accessToken ?? null
  }
  return getDevToken()
}

export async function hasSession(): Promise<boolean> {
  return (await getAuthToken()) !== null
}

/** Subscribe to auth changes (Supabase events + local dev token writes). */
export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener)

  const unsubscribeSupabase = onSupabaseAuthStateChange(() => listener())
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEV_TOKEN_KEY) listener()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    unsubscribeSupabase()
    window.removeEventListener('storage', onStorage)
  }
}
