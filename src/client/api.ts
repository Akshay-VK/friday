export type ThemePreference = 'light' | 'dark' | 'system'

export type ActionSummary = {
  id: string
  label: string
  description: string
  method: string
  path: string
  harmless: boolean
}

export type BootstrapPayload = {
  version: string
  csrfToken: string
  theme: ThemePreference
}

export type HealthPayload = {
  status: string
  version: string
}

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let csrfToken: string | null = null

export function rememberCsrfToken(token: string): void {
  csrfToken = token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
  })
  const isJson = (response.headers.get('content-type') ?? '').includes(
    'application/json',
  )
  const payload: unknown = isJson ? await response.json() : undefined
  if (!response.ok) {
    const body = payload as { error?: string; code?: string } | undefined
    throw new ApiError(
      body?.error ?? `Request failed with status ${response.status}`,
      response.status,
      body?.code,
    )
  }
  return payload as T
}

export function getBootstrap(): Promise<BootstrapPayload> {
  return request('/api/bootstrap')
}

export function getHealth(): Promise<HealthPayload> {
  return request('/api/health')
}

export function getTheme(): Promise<{ theme: ThemePreference }> {
  return request('/api/preferences/theme')
}

export function saveTheme(theme: ThemePreference): Promise<{
  theme: ThemePreference
}> {
  if (!csrfToken) {
    return Promise.reject(
      new ApiError('Session authorisation is not available yet', 0),
    )
  }
  return request('/api/preferences/theme', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Friday-CSRF': csrfToken,
    },
    body: JSON.stringify({ value: theme }),
  })
}

export function searchActions(query: string): Promise<{
  query: string
  results: ActionSummary[]
}> {
  return request(`/api/search?q=${encodeURIComponent(query)}`)
}

export type Backup = { id: string; createdAt: string; kind: string; counts: { preferences: number } }
export type RestorePreview = { confirmation: string; currentTheme: ThemePreference; restoredTheme: ThemePreference; counts: { preferences: number }; excluded: string[]; createdAt: string }

function protectedPost<T>(path: string, body: object = {}): Promise<T> {
  if (!csrfToken) return Promise.reject(new ApiError('Session authorisation is not available yet', 0))
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Friday-CSRF': csrfToken }, body: JSON.stringify(body) })
}
export function listBackups(): Promise<{ backups: Backup[]; lastFailure?: string }> { return request('/api/backups') }
export function createBackup(): Promise<Backup> { return protectedPost('/api/backups/create') }
export function previewRestore(id: string): Promise<RestorePreview> { return protectedPost('/api/backups/restore-preview', { id }) }
export function restoreBackup(id: string, confirmation: string): Promise<{ theme: ThemePreference }> { return protectedPost('/api/backups/restore', { id, confirmation }) }
