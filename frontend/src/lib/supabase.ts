/**
 * Supabase client + the auth utility functions used by the whole app.
 *
 * Credentials can come from either place (first one wins):
 *   1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `frontend/.env`
 *   2. the backend's `GET /api/config` (so a single `backend/.env` configures both)
 *
 * When Supabase is not configured the app falls back to the backend's local
 * dev-auth provider, which exposes an identical email/password contract.
 */
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js'

const envUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

let client: SupabaseClient | null = null

if (envUrl && envAnonKey) {
  client = createClient(envUrl, envAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // required for the Google OAuth redirect back into the app
      flowType: 'pkce',
    },
  })
}

/** Let the backend configure Supabase at runtime when the build has no env vars. */
export function configureSupabase(url: string, anonKey: string): void {
  if (client || !url || !anonKey) return
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
}

export function getSupabase(): SupabaseClient | null {
  return client
}

export function isSupabaseReady(): boolean {
  return client !== null
}

export interface AuthUser {
  id: string
  email: string
  username?: string | null
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  /** true when Supabase still needs the user to click the confirmation email */
  pendingEmailConfirmation?: boolean
}

function toAuthSession(session: Session): AuthSession {
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      username: (session.user.user_metadata?.username as string | undefined) ?? null,
    },
    accessToken: session.access_token,
  }
}

/* -------------------------------------------------------------------------- */
/* Email + password                                                           */
/* -------------------------------------------------------------------------- */
export interface SignUpParams {
  email: string
  password: string
  username?: string
}

/**
 * Register with email + password. The username is stored in user metadata and
 * then claimed by the backend on first login (so it stays unique server side).
 */
export async function signUpWithEmail({ email, password, username }: SignUpParams): Promise<AuthSession | null> {
  if (!client) throw new Error('Supabase is not configured')

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { username: username ?? null, display_name: username ?? null },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) throw new Error(error.message)

  // When email confirmation is enabled Supabase returns a user but no session.
  if (!data.session) {
    return {
      user: { id: data.user?.id ?? '', email, username: username ?? null },
      accessToken: '',
      pendingEmailConfirmation: true,
    }
  }
  return toAuthSession(data.session)
}

export async function signInWithEmail(email: string, password: string): Promise<AuthSession> {
  if (!client) throw new Error('Supabase is not configured')

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  if (!data.session) throw new Error('Could not start a session. Please confirm your email address first.')

  return toAuthSession(data.session)
}

/* -------------------------------------------------------------------------- */
/* Google OAuth                                                               */
/* -------------------------------------------------------------------------- */
/**
 * Kick off the Google OAuth flow. Supabase redirects to Google and back to
 * `redirectPath`, where `detectSessionInUrl` finishes the login.
 */
export async function signInWithGoogle(redirectPath = '/dashboard'): Promise<void> {
  if (!client) throw new Error('Supabase is not configured')

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error) throw new Error(error.message)
}

/* -------------------------------------------------------------------------- */
/* Session helpers                                                            */
/* -------------------------------------------------------------------------- */
export async function getSupabaseSession(): Promise<AuthSession | null> {
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session ? toAuthSession(data.session) : null
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSupabaseSession()
  return session?.accessToken ?? null
}

export async function signOutSupabase(): Promise<void> {
  if (!client) return
  await client.auth.signOut()
}

/** Re-issue the access token so server-side role changes take effect now. */
export async function refreshSupabaseSession(): Promise<void> {
  if (!client) return
  const { error } = await client.auth.refreshSession()
  if (error) throw new Error(error.message)
}

export function onSupabaseAuthStateChange(
  handler: (session: AuthSession | null, event: string) => void,
): () => void {
  if (!client) return () => {}
  const { data } = client.auth.onAuthStateChange((event, session) => {
    handler(session ? toAuthSession(session) : null, event)
  })
  return () => data.subscription.unsubscribe()
}

export async function updateSupabasePassword(newPassword: string): Promise<void> {
  if (!client) throw new Error('Supabase is not configured')
  const { error } = await client.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
}

export type { Session, SupabaseClient, User }
