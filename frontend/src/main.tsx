import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './state/AuthContext'
import { ThemeProvider } from './state/ThemeContext'
import { ToastProvider } from './state/ToastContext'
import { applyTheme, DEFAULT_THEME } from './lib/themes'
import './index.css'

// Paint the shell with the saved theme before React mounts (no white flash).
applyTheme(localStorage.getItem('routinery.theme') ?? DEFAULT_THEME)

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
