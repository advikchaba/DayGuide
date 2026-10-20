import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error' | 'info' | 'coins'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void
  toasts: Toast[]
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++
      setToasts((current) => [...current.slice(-3), { id, message, tone }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3600)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ push, toasts, dismiss }), [push, toasts, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            style={toast.tone === 'info' ? { background: 'var(--surface-solid)' } : undefined}
            className={[
              'pointer-events-auto animate-fade-up rounded-lg px-4 py-3 text-left text-sm font-medium transition',
              toast.tone === 'success' ? 'bg-emerald-500/15 text-emerald-100' : '',
              toast.tone === 'error' ? 'bg-rose-500/15 text-rose-100' : '',
              toast.tone === 'info' ? 'text-ink' : '',
              toast.tone === 'coins' ? 'bg-amber-400/15 text-amber-100' : '',
            ].join(' ')}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
