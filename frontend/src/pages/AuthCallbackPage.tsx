import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Spinner } from '../components/ui'
import { getSupabaseSession } from '../lib/supabase'
import { useAuth } from '../state/AuthContext'

/**
 * Landing spot for the Supabase OAuth redirect (and email confirmation links).
 * Supabase parses the tokens out of the URL hash, we just wait for the session
 * to appear and then hand control back to the app.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { refresh, profile } = useAuth()
  const [message, setMessage] = useState('Finishing sign-in…')
  const next = params.get('next') ?? '/dashboard'
  const errorDescription = params.get('error_description') ?? params.get('error')

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    const run = async () => {
      if (errorDescription) {
        setMessage(`Sign-in failed: ${errorDescription.replace(/\+/g, ' ')}`)
        window.setTimeout(() => navigate('/login', { replace: true }), 3500)
        return
      }

      const session = await getSupabaseSession()
      if (cancelled) return

      if (session) {
        const me = await refresh()
        if (cancelled) return
        navigate(me?.username ? next : '/onboarding', { replace: true })
        return
      }

      attempts += 1
      if (attempts > 30) {
        setMessage('We could not complete the sign-in. Please log in again.')
        window.setTimeout(() => navigate('/login', { replace: true }), 3000)
      } else {
        window.setTimeout(run, 350)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [errorDescription, navigate, next, refresh])

  useEffect(() => {
    if (profile?.username) navigate(next, { replace: true })
  }, [profile, navigate, next])

  return (
    <div className="app-shell grid min-h-screen place-items-center">
      <div className="app-content flex items-center gap-3 text-muted">
        <Spinner />
        {message}
      </div>
    </div>
  )
}
