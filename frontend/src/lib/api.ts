/**
 * Thin fetch wrapper around the FastAPI backend.
 * Attaches the bearer token and normalises error messages.
 */
import { getAuthToken } from './authClient'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function extractDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined
    if (first?.msg) return first.msg
  }
  return fallback
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  json?: unknown
  formData?: FormData
  auth?: boolean
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, formData, auth = true } = options
  const headers: Record<string, string> = {}

  if (auth) {
    const token = await getAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  if (json !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: formData ?? (json !== undefined ? JSON.stringify(json) : undefined),
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload = text ? safeJson(text) : null

  if (!response.ok) {
    throw new ApiError(response.status, extractDetail(payload, `Request failed (${response.status})`))
  }
  return payload as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: 'PATCH', json }),
  del: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    apiRequest<T>(path, { method: 'POST', formData }),
  public: <T>(path: string) => apiRequest<T>(path, { auth: false }),
}
