import { Spinner } from './ui'

export function SessionLoading({ label = 'Restoring your session…' }: { label?: string }) {
  return (
    <div className="app-shell grid min-h-screen place-items-center">
      <div className="app-content flex items-center gap-3 text-muted">
        <Spinner /> {label}
      </div>
    </div>
  )
}
