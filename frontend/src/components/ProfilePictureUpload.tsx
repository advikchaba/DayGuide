import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from './ui'
import { api, ApiError } from '../lib/api'
import type { Profile } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

interface ProfilePictureUploadProps {
  variant?: 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  full?: boolean
  className?: string
}

/**
 * Opens the file picker and uploads a custom profile picture.
 * The backend validates the image and charges the coin cost atomically.
 */
export function ProfilePictureUpload({
  variant = 'secondary',
  size = 'md',
  full = false,
  className = '',
}: ProfilePictureUploadProps) {
  const { profile, applyProfile } = useAuth()
  const { push } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  if (!profile) return null

  const cost = profile.avatar_change_cost ?? 100
  const shortfall = Math.max(0, cost - profile.coins)
  const affordable = shortfall === 0
  const action = profile.avatar_url ? 'Change picture' : 'Upload picture'

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const form = new FormData()
    form.append('file', file)

    setUploading(true)
    try {
      const updated = await api.upload<Profile>('/me/avatar/upload', form)
      applyProfile(updated)
      push(`Profile picture updated — ${cost} coins spent.`, 'success')
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not upload that picture.', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        full={full}
        className={className}
        loading={uploading}
        disabled={!affordable}
        onClick={() => inputRef.current?.click()}
        title={affordable ? 'JPEG, PNG or WebP' : 'Not enough coins yet'}
      >
        {affordable ? `${action} · ${cost} coins` : `Need ${shortfall} more coins`}
      </Button>
    </>
  )
}
