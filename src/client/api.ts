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

export type Source = { id: string; path: string; nativePath: string; host: string; exclusions: string[]; enabled: boolean; revision: number; health: string }
export type SourcePreview = { previewId: string; path: string; nativePath: string; host: string; exclusions: string[]; sample: string[]; skipped: string[]; truncated: boolean; depth: number; entryLimit: number }
export function listSources(): Promise<{ sources: Source[] }> { return request('/api/sources') }
export function pickSource(): Promise<{ kind: 'selected'; path: string } | { kind: 'cancelled' } | { kind: 'unavailable'; message: string }> { return protectedPost('/api/sources/pick') }
export function previewSource(path: string, exclusions: string[]): Promise<SourcePreview> { return protectedPost('/api/sources/preview', { path, host: navigator.platform.startsWith('Win') ? 'windows' : 'local', exclusions }) }
export function cancelSource(previewId: string): Promise<{ cancelled: boolean }> { return protectedPost('/api/sources/cancel', { previewId }) }
export function approveSource(preview: SourcePreview): Promise<Source> { return protectedPost('/api/sources', { previewId: preview.previewId, path: preview.path, host: preview.host, exclusions: preview.exclusions }) }
export function disableSource(source: Source): Promise<Source> { return protectedSource(`/api/sources/${encodeURIComponent(source.id)}`, 'PATCH', { enabled: false, expectedRevision: source.revision }) }
export function revokeSource(source: Source): Promise<{ revoked: boolean }> { return protectedSource(`/api/sources/${encodeURIComponent(source.id)}`, 'DELETE', {}) }
function protectedSource<T>(path: string, method: string, body: object): Promise<T> {
  if (!csrfToken) return Promise.reject(new ApiError('Session authorisation is not available yet', 0))
  return request(path, { method, headers: { 'Content-Type': 'application/json', 'X-Friday-CSRF': csrfToken }, body: JSON.stringify(body) })
}
