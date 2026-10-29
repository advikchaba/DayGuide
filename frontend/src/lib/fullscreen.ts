import { useEffect } from 'react'
import { isAndroidApp } from './reminders'

/**
 * The TWA already asks Chrome for immersive mode, but some Chrome/OEM combos
 * still show the browser/system bars. If the wrapper is in browser display
 * mode, enter the Fullscreen API on the first tap as a fallback.
 */
export function useImmersiveFullscreen() {
  useEffect(() => {
    if (!isAndroidApp()) return
    if (window.matchMedia?.('(display-mode: fullscreen)').matches) return

    const enter = () => {
      if (document.fullscreenElement) return
      const request = document.documentElement.requestFullscreen
      if (!request) return
      void request
        .call(document.documentElement, { navigationUI: 'hide' })
        .catch(() => {
          // Fullscreen can be denied by the browser or by an OEM policy.
        })
    }

    // A no-gesture request is often rejected, so retry on the first interaction.
    const timer = window.setTimeout(enter, 1200)
    window.addEventListener('pointerdown', enter, { passive: true })

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', enter)
    }
  }, [])
}
