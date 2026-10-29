import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './state/AuthContext'
import { ThemeProvider } from './state/ThemeContext'
import { ToastProvider } from './state/ToastContext'
import { applyTheme, DEFAULT_THEME } from './lib/themes'
import { registerNotificationWorker } from './lib/notifications'
import './index.css'

// Paint the shell with the saved theme before React mounts (no white flash).
applyTheme(localStorage.getItem('routinery.theme') ?? DEFAULT_THEME)

// Register the notification worker for PWA installability and notification
// clicks. It deliberately has no fetch handler, so it never caches app data.
if ('serviceWorker' in navigator) {
  if (document.readyState === 'complete') {
    void registerNotificationWorker()
  } else {
    window.addEventListener('load', () => {
      void registerNotificationWorker()
    })
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
