import { randomUUID } from 'node:crypto'
import { lstat, realpath, opendir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import { spawn } from 'node:child_process'
import type { Hono } from 'hono'
import type { LocalSecurity } from './security.ts'
import type { StoreClient } from './store/client.ts'
import type { Source } from './store/schema.ts'

type Scope = { path: string; nativePath: string; host: 'local' | 'windows'; exclusions: string[] }
type Ticket = Scope & { id: string; owner: string; expires: number }
export type PickerResult = { kind: 'selected'; path: string } | { kind: 'cancelled' } | { kind: 'unavailable'; message: string }
export type SourceAdapters = { pick?: () => Promise<PickerResult>; inspectEntry?: (path: string, signal: AbortSignal) => ReturnType<typeof lstat>; checkRoot?: (path: string) => ReturnType<typeof lstat> }
const LIMIT = 48
const TTL = 2 * 60_000

function inside(parent: string, child: string) {
  const part = relative(parent, child)
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part))
}

function validPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.split(/[\\/]/).includes('..')) return false
  if (process.platform === 'win32') {
    if (!/^[A-Za-z]:\\[^\\]/.test(value) || value.includes('/') || value.includes('\\.\\') || value.includes('\\?\\')) return false
    return win32.normalize(value) === value && win32.parse(value).root !== value
  }
  return isAbsolute(value) && resolve(value) === value && value !== '/'
}

function parse(body: unknown): Omit<Scope, 'nativePath'> {
  const input = body as { path?: unknown; host?: unknown; exclusions?: unknown } | null
  const host = process.platform === 'win32' ? 'windows' : 'local'
  if (input?.host !== host || !validPath(input.path) || !Array.isArray(input.exclusions) || input.exclusions.length > 32 || input.exclusions.some((item) => typeof item !== 'string' || !/^[^\\/]+$/.test(item) || item === '.' || item === '..' || item.length > 128) || new Set(input.exclusions).size !== input.exclusions.length) throw new Error('Enter an absolute native folder and simple, distinct excluded folder names for this host')
  return { path: input.path, host, exclusions: input.exclusions as string[] }
}

async function validate(scope: Omit<Scope, 'nativePath'>, dataHome: string): Promise<Scope> {
  const entry = await lstat(scope.path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Select a physical directory, not a link or placeholder')
  const nativePath = await realpath(scope.path)
  const nativeHome = await realpath(dataHome)
  if (inside(nativeHome, nativePath) || inside(nativePath, nativeHome)) throw new Error('Scan root overlaps Friday data home; choose a separate folder or relocate the data home')
  return { ...scope, nativePath }
}

// A native Windows host dialog is only invoked by an explicit guarded POST.
// Noninteractive desktops and other platforms never fabricate a selection.
async function pick(): Promise<PickerResult> {
  if (process.platform !== 'win32') return { kind: 'unavailable', message: 'Native Windows picker requires the Windows host. Enter a local absolute path manually.' }
  const code = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine('SELECTED:' + $d.SelectedPath) } else { [Console]::WriteLine('CANCELLED') }`
  return new Promise((done) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', code], { windowsHide: false, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    const timer = setTimeout(() => child.kill(), 60_000)
    child.stdout.on('data', (chunk: Buffer) => { if (output.length < 4096) output += chunk.toString('utf8') })
    child.on('error', () => { clearTimeout(timer); done({ kind: 'unavailable', message: 'Folder picker unavailable. Enter the native Windows path manually.' }) })
    child.on('close', (status) => {
      clearTimeout(timer)
      if (status !== 0) done({ kind: 'unavailable', message: 'Folder picker unavailable. Enter the native Windows path manually.' })
      else if (output.trim() === 'CANCELLED') done({ kind: 'cancelled' })
      else if (output.startsWith('SELECTED:') && validPath(output.slice(9).trim())) done({ kind: 'selected', path: output.slice(9).trim() })
      else done({ kind: 'unavailable', message: 'Folder picker returned no usable path. Enter it manually.' })
    })
  })
}

export function registerSources(app: Hono, security: LocalSecurity, store: StoreClient, dataHome: string, adapters: SourceAdapters = {}) {
  const tickets = new Map<string, Ticket>()
  const pending = new Map<string, { owner: string; path: string; controller: AbortController }>()
  const generations = new Map<string, number>()
  const invalidate = (path: string) => {
    generations.set(path, (generations.get(path) ?? 0) + 1)
    for (const request of pending.values()) if (request.path === path) request.controller.abort()
    for (const [id, ticket] of tickets) if (ticket.nativePath === path || ticket.path === path) tickets.delete(id)
  }
  const error = (e: unknown) => {
    const code = (e as NodeJS.ErrnoException)?.code
    return code === 'ENOENT' || code === 'ENOTDIR' ? { code: 'SOURCE_OFFLINE', error: 'Folder is offline or missing. Reconnect it or edit the path, then retry.' } : code === 'EACCES' || code === 'EPERM' ? { code: 'SOURCE_DENIED', error: 'Access denied. Check folder permissions, then retry.' } : { code: 'INVALID_SCOPE', error: e instanceof Error ? e.message : 'Invalid source scope' }
  }
  app.get('/api/sources', async (c) => {
    const sources = await store.listSources()
    for (const source of sources) {
      if (!source.enabled || source.host !== (process.platform === 'win32' ? 'windows' : 'local')) continue
      let health: 'ready' | 'offline' | 'denied' = 'ready'
      try {
        const info = await (adapters.checkRoot ?? lstat)(source.nativePath)
        if (!info.isDirectory() || info.isSymbolicLink()) health = 'denied'
      }
      catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        health = code === 'EACCES' || code === 'EPERM' ? 'denied' : 'offline'
      }
      if (source.health !== health) source.health = (await store.setSourceHealth(source.id, source.revision, health)).health
    }
    return c.json({ sources })
  })
  app.post('/api/sources/pick', security.mutationGuard, async (c) => {
    try {
      const result = await (adapters.pick ?? pick)()
      return c.json(result.kind === 'selected' && !validPath(result.path) ? { kind: 'unavailable', message: 'Folder picker returned no usable path. Enter it manually.' } : result)
    } catch { return c.json({ kind: 'unavailable', message: 'Folder picker unavailable. Enter the native path manually.' }) }
  })
  app.post('/api/sources/preview', security.mutationGuard, async (c) => {
    let requestId: string | undefined
    try {
      const body = await c.req.json() as { requestId?: unknown; host?: unknown }
      if (body.host === 'wsl') return c.json({ code: 'WSL_MAPPING_UNVERIFIED', error: 'WSL roots require an explicitly selected distro and verified native mapping; this host cannot preview them yet.' }, 503)
      const scope = parse(body)
      // Windows metadata/reparse and handle-bound containment need independent native proof.
      // Refuse preview instead of hydrating unknown placeholders or racing junctions.
      if (process.platform === 'win32') return c.json({ code: 'NATIVE_VERIFICATION_REQUIRED', error: 'Windows placeholder-safe and handle-bound preview is not yet verified; no folder was read.' }, 503)
      if (body.requestId !== undefined) {
        if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId) || pending.has(body.requestId) || tickets.has(body.requestId)) throw new Error('Invalid or duplicate preview request ID')
        requestId = body.requestId
      } else requestId = randomUUID()
      const active = { owner: c.req.header('x-friday-csrf')!, path: scope.path, controller: new AbortController() }
      pending.set(requestId, active)
      const generation = generations.get(scope.path) ?? 0
      const check = () => { if (active.controller.signal.aborted || generation !== (generations.get(scope.path) ?? 0)) throw new Error('Preview cancelled or source permission changed; preview again') }
      const checked = await validate(scope, dataHome)
      check()
      for (const [id, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(id)
      if (tickets.size >= 32) return c.json({ code: 'PREVIEW_BUSY', error: 'Too many pending previews. Cancel an earlier preview or retry after two minutes.' }, 429)
      const sample: string[] = []
      const skipped: string[] = []
      let count = 0
      const handle = await opendir(checked.nativePath)
      try {
        for await (const entry of handle) {
          if (++count > LIMIT) break
          const name = entry.name
          if (scope.exclusions.includes(name)) continue
          const path = resolve(checked.nativePath, name)
          check()
          const info = await (adapters.inspectEntry ? adapters.inspectEntry(path, active.controller.signal) : lstat(path))
          check()
          if (info.isSymbolicLink()) skipped.push(name)
          else sample.push(name)
        }
      } finally { await handle.close().catch(() => undefined) }
      check()
      const id = requestId
      tickets.set(id, { ...checked, id, owner: c.req.header('x-friday-csrf')!, expires: Date.now() + TTL })
      return c.json({ previewId: id, path: scope.path, nativePath: checked.nativePath, host: scope.host, exclusions: scope.exclusions, sample, skipped, truncated: count > LIMIT, depth: 1, entryLimit: LIMIT, expiresInSeconds: TTL / 1000 })
    } catch (e) { return c.json(error(e), 400) }
    finally { if (requestId) pending.delete(requestId) }
  })
  app.post('/api/sources/cancel', security.mutationGuard, async (c) => {
    const body = await c.req.json().catch(() => null) as { previewId?: unknown } | null
    const ticket = tickets.get(String(body?.previewId))
    if (ticket && ticket.owner === c.req.header('x-friday-csrf')) tickets.delete(ticket.id)
    const active = pending.get(String(body?.previewId))
    if (active && active.owner === c.req.header('x-friday-csrf')) active.controller.abort()
    return c.json({ cancelled: true })
  })
  app.post('/api/sources', security.mutationGuard, async (c) => {
    try {
      const body = await c.req.json() as { previewId?: unknown }
      const ticket = tickets.get(String(body?.previewId))
      if (!ticket || ticket.owner !== c.req.header('x-friday-csrf') || ticket.expires < Date.now()) throw new Error('Preview expired or cancelled; preview again')
      const scope = parse(body)
      if (JSON.stringify([scope.path, scope.host, scope.exclusions]) !== JSON.stringify([ticket.path, ticket.host, ticket.exclusions])) throw new Error('Scope changed; preview again')
      const checked = await validate(scope, dataHome)
      if (!tickets.has(ticket.id)) throw new Error('Preview cancelled or source permission changed; preview again')
      if (checked.nativePath !== ticket.nativePath) throw new Error('Folder identity changed; preview again')
      tickets.delete(ticket.id)
      const source: Source = { ...checked, id: randomUUID(), enabled: true, revision: 1, health: 'ready' }
      return c.json(await store.addSource(source))
    } catch (e) { return c.json(error(e), 400) }
  })
  app.patch('/api/sources/:id', security.mutationGuard, async (c) => {
    const body = await c.req.json().catch(() => null) as { enabled?: unknown; expectedRevision?: unknown } | null
    if (body?.enabled !== false || !Number.isSafeInteger(body.expectedRevision)) return c.json({ error: 'Only disabling an exact revision is supported; refresh to retry' }, 400)
    try {
      const existing = (await store.listSources()).find((item) => item.id === c.req.param('id'))
      if (!existing || existing.revision !== body.expectedRevision) throw new Error('Source changed or was removed; refresh before disabling')
      invalidate(existing.path)
      invalidate(existing.nativePath)
      const disabled = await store.disableSource(c.req.param('id'), body.expectedRevision as number)
      for (const [id, ticket] of tickets) if (ticket.nativePath === disabled.nativePath) tickets.delete(id)
      return c.json(disabled)
    }
    catch (e) { return c.json(error(e), 409) }
  })
  app.delete('/api/sources/:id', security.mutationGuard, async (c) => {
    const source = (await store.listSources()).find((item) => item.id === c.req.param('id'))
    if (source) { invalidate(source.path); invalidate(source.nativePath) }
    return c.json({ revoked: await store.revokeSource(c.req.param('id')) })
  })
  return () => { tickets.clear(); for (const request of pending.values()) request.controller.abort() }
}
