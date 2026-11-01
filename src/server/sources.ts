import { randomUUID } from 'node:crypto'
import { lstat, realpath, opendir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Hono } from 'hono'
import type { LocalSecurity } from './security.ts'
import type { StoreClient } from './store/client.ts'
import type { Source } from './store/schema.ts'

type Scope = { path: string; nativePath: string; host: 'local' | 'windows'; exclusions: string[] }
type Ticket = Scope & { id: string; owner: string; expires: number; identity?: string; generation: number }
export type PickerResult = { kind: 'selected'; path: string } | { kind: 'cancelled' } | { kind: 'unavailable'; message: string }
export type SourceAdapters = { pick?: () => Promise<PickerResult>; inspectEntry?: (path: string, signal: AbortSignal) => ReturnType<typeof lstat>; checkRoot?: (path: string) => ReturnType<typeof lstat>; onNativeHold?: (release: () => Promise<void>) => Promise<void> }
const LIMIT = 48
const TTL = 2 * 60_000
const WINDOWS_HELPER = fileURLToPath(new URL('../../native/source-preview.exe', import.meta.url))
const INVENTORY_HELPER = fileURLToPath(new URL('../../native/source-inventory.exe', import.meta.url))
let inventoryBusy = false // ponytail: one concurrent native scan; per-source queue only if fixture throughput requires it.

function nativeInventory(source: Source, home: string, signal: AbortSignal): Promise<{ observations: string[]; partial: boolean }> {
  return new Promise((resolveResult, reject) => {
    if (signal.aborted || !source.identity) return reject(new Error('Source cancelled or missing approved root identity'))
    const child = spawn(INVENTORY_HELPER, [source.nativePath, home, source.identity, ...(process.env.FRIDAY_DIAGNOSTICS === '1' && process.env.FRIDAY_TEST_INVENTORY_STALL === '1' ? ['--stall'] : [])], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let size = 0
    let failed = false
    let stderr = ''
    const kill = () => { failed = true; child.kill() }
    signal.addEventListener('abort', kill, { once: true })
    const timer = setTimeout(kill, 2_500)
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8192) kill(); else chunks.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8').slice(0, Math.max(0, 256 - stderr.length)) })
    child.once('error', (error) => { failed = true; reject(error) })
    child.once('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', kill)
      if (failed || code !== 0 || signal.aborted) return reject(new Error(`Native inventory refused (${stderr || 'cancelled, timed out or oversized'})`))
      const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)
      const end = lines.pop() === '' ? lines.pop() : undefined
      const match = /^END entries=(\d+) depth=3 bytes=(\d+) clipped=([01])$/.exec(end ?? '')
      if (!match || Number(match[1]) > 32 || Number(match[2]) > 256 || lines.length > 32 ||
        lines.some((line) => !/^(DIR|FILE|SKIP|MANIFEST) [0-3] "(?:\\u[0-9a-f]{4})+"(?: [0-9a-f]{0,512})?$/.test(line))) return reject(new Error('Incomplete or invalid native inventory'))
      resolveResult({ observations: lines, partial: match[3] === '1' })
    })
  })
}
type NativeResult = { version: 1; nativePath: string; identity: string; sample: string[]; skipped: string[]; truncated: boolean }

function nativePreview(path: string, home: string, mode: '--preview' | '--identity' | '--hold', signal?: AbortSignal): Promise<{ value: NativeResult; lease?: SharedArrayBuffer; release: () => Promise<void> }> {
  return new Promise((resolveResult, reject) => {
    if (signal?.aborted) { reject(new Error('Preview cancelled')); return }
    const child = spawn(WINDOWS_HELPER, [mode, path, home], { windowsHide: true, stdio: [mode === '--hold' ? 'pipe' : 'ignore', 'pipe', 'pipe'], signal })
    let output = ''
    let errorOutput = ''
    let oversized = false
    let settled = false
    let childClosed = false
    const lease = mode === '--hold' ? new SharedArrayBuffer(4) : undefined
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Native metadata preview timed out')) }, 5_000)
    const parseOutput = () => {
      if (settled) return
      try {
        const result: unknown = JSON.parse(output)
        const value = result as NativeResult
        const names = (items: unknown): items is string[] => Array.isArray(items) && items.length <= LIMIT && items.every((item) => typeof item === 'string' && item.length > 0 && item.length < 1024 && item !== '.' && item !== '..' && !/[\\/:\0]/.test(item))
        if (value.version !== 1 || typeof value.nativePath !== 'string' || !validPath(value.nativePath) || value.nativePath.toLowerCase() !== path.toLowerCase() ||
            typeof value.identity !== 'string' || !/^[a-f0-9]{16}-[a-f0-9]{32}$/.test(value.identity) ||
            !names(value.sample) || !names(value.skipped) || value.sample.length + value.skipped.length > LIMIT ||
            typeof value.truncated !== 'boolean' || (mode !== '--preview' && (value.sample.length !== 0 || value.skipped.length !== 0 || value.truncated))) throw new Error('Invalid native metadata response')
        settled = true
        if (lease) Atomics.store(new Int32Array(lease), 0, 1)
        clearTimeout(timeout)
        resolveResult({ value, lease, release: async () => {
          if (childClosed) return
          const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
          child.stdin?.end('x')
          child.kill()
          await closed
        } })
      } catch { child.kill(); reject(new Error('Invalid native metadata response')) }
    }
    child.stdout!.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(output) + chunk.length > 65_536) { oversized = true; child.kill() }
      else { output += chunk.toString('utf8'); if (mode === '--hold' && output.endsWith('\n')) parseOutput() }
    })
    child.stderr!.on('data', (chunk: Buffer) => { if (errorOutput.length < 1024) errorOutput += chunk.toString('utf8').slice(0, 1024) })
    child.on('error', (e) => { clearTimeout(timeout); reject(e) })
    child.on('close', (status) => {
      childClosed = true
      if (lease) Atomics.store(new Int32Array(lease), 0, 0)
      clearTimeout(timeout)
      if (settled) return
      if (status !== 0 || oversized || signal?.aborted) { reject(new Error(`Native metadata verification refused (${errorOutput.trim() || 'cancelled or unavailable'})`)); return }
      parseOutput()
    })
  })
}

function inside(parent: string, child: string) {
  const part = relative(parent, child)
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part))
}

function validPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.split(/[\\/]/).includes('..')) return false
  if (process.platform === 'win32') {
    if (!/^[A-Za-z]:\\[^\\]/.test(value) || value.length >= 1024 || value.includes('/') || value.includes('~') || /[ :.]$/.test(value) || value.split('\\').slice(1).some((part) => !part || /[ .]$/.test(part) || part.includes(':') || /[\x00-\x1f]/.test(part))) return false
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
  const inventoryJobs = new Map<string, AbortController>()
  const invalidate = (path: string) => {
    generations.set(path, (generations.get(path) ?? 0) + 1)
    for (const request of pending.values()) if (request.path === path) request.controller.abort()
    for (const job of inventoryJobs.values()) if ((job as AbortController & { path?: string }).path === path) job.abort()
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
  app.post('/api/sources/:id/inventory', security.mutationGuard, async (c) => {
    if (process.platform !== 'win32' || process.env.FRIDAY_DIAGNOSTICS !== '1') return c.json({ code: 'UNSUPPORTED_CAPABILITY', error: 'Native fixture inventory is unavailable on this host' }, 503)
    if (inventoryBusy) return c.json({ code: 'RATE_LIMITED', error: 'Native inventory already running' }, 429)
    inventoryBusy = true
    try {
      const source = (await store.listSources()).find((item) => item.id === c.req.param('id'))
      const temp = tmpdir()
      if (!source?.enabled || source.host !== 'windows' || !source.identity || source.exclusions.length || !source.nativePath.toLowerCase().startsWith(`${temp.toLowerCase()}\\friday-inventory-`) ||
        source.nativePath.toLowerCase() === temp.toLowerCase()) return c.json({ code: 'INVALID_SCOPE', error: 'Only an active approved Windows TEMP fixture is supported' }, 403)
      const controller = new AbortController()
      ;(controller as AbortController & { path?: string }).path = source.nativePath
      inventoryJobs.set(source.id, controller)
      const result = await nativeInventory(source, dataHome, controller.signal)
      if (controller.signal.aborted) throw new Error('Source permission changed')
      await store.commitInventory(source.id, source.revision, source.identity, result.observations, result.partial)
      if (controller.signal.aborted) throw new Error('Source permission changed')
      return c.json({ sourceId: source.id, ...result })
    } catch { return c.json({ code: 'SOURCE_UNAVAILABLE', error: 'Native inventory refused, changed, cancelled or timed out; no partial output committed' }, 409) }
    finally { inventoryBusy = false; inventoryJobs.delete(c.req.param('id')) }
  })
  app.get('/api/sources/:id/inventory', async (c) => {
    if (process.platform !== 'win32' || process.env.FRIDAY_DIAGNOSTICS !== '1') return c.json({ code: 'UNSUPPORTED_CAPABILITY' }, 503)
    return c.json({ inventory: await store.getInventory(c.req.param('id')) })
  })
  app.post('/api/sources/preview', security.mutationGuard, async (c) => {
    let requestId: string | undefined
    try {
      const body = await c.req.json() as { requestId?: unknown; host?: unknown }
      if (body.host === 'wsl') return c.json({ code: 'WSL_MAPPING_UNVERIFIED', error: 'WSL roots require an explicitly selected distro and verified native mapping; this host cannot preview them yet.' }, 503)
      const scope = parse(body)
      if (body.requestId !== undefined) {
        if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId) || pending.has(body.requestId) || tickets.has(body.requestId)) throw new Error('Invalid or duplicate preview request ID')
        requestId = body.requestId
      } else requestId = randomUUID()
      const active = { owner: c.req.header('x-friday-csrf')!, path: scope.path, controller: new AbortController() }
      pending.set(requestId, active)
      const generation = generations.get(scope.path) ?? 0
      const check = () => { if (active.controller.signal.aborted || generation !== (generations.get(scope.path) ?? 0)) throw new Error('Preview cancelled or source permission changed; preview again') }
      const native = process.platform === 'win32' ? (await nativePreview(scope.path, dataHome, '--preview', active.controller.signal)).value : undefined
      const checked = native ? { ...scope, nativePath: native.nativePath } : await validate(scope, dataHome)
      check()
      for (const [id, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(id)
      if (tickets.size >= 32) return c.json({ code: 'PREVIEW_BUSY', error: 'Too many pending previews. Cancel an earlier preview or retry after two minutes.' }, 429)
      const sample: string[] = []
      const skipped: string[] = []
      let count = 0
      if (native) {
        sample.push(...native.sample.filter((name) => !scope.exclusions.includes(name)))
        skipped.push(...native.skipped.filter((name) => !scope.exclusions.includes(name)))
        count = native.truncated ? LIMIT + 1 : native.sample.length + native.skipped.length
      } else {
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
      }
      check()
      const id = requestId
      await store.registerApproval({ ...checked, id, owner: active.owner, expires: Date.now() + TTL, identity: native?.identity, generation })
      try { check() } catch (e) { await store.cancelApproval(id, active.owner); throw e }
      tickets.set(id, { ...checked, id, owner: active.owner, expires: Date.now() + TTL, identity: native?.identity, generation })
      return c.json({ previewId: id, path: scope.path, nativePath: checked.nativePath, host: scope.host, exclusions: scope.exclusions, sample, skipped, truncated: count > LIMIT, depth: 1, entryLimit: LIMIT, expiresInSeconds: TTL / 1000 })
    } catch (e) {
      if (process.platform === 'win32' && (e as NodeJS.ErrnoException)?.code === 'ENOENT' && String((e as Error).message).includes('source-preview.exe')) return c.json({ code: 'NATIVE_VERIFICATION_REQUIRED', error: 'Build the reviewed Windows metadata helper before preview; no source permission was granted.' }, 503)
      return c.json(error(e), 400)
    }
    finally { if (requestId) pending.delete(requestId) }
  })
  app.post('/api/sources/cancel', security.mutationGuard, async (c) => {
    const body = await c.req.json().catch(() => null) as { previewId?: unknown } | null
    const ticket = tickets.get(String(body?.previewId))
    if (ticket && ticket.owner === c.req.header('x-friday-csrf')) tickets.delete(ticket.id)
    await store.cancelApproval(String(body?.previewId), c.req.header('x-friday-csrf')!)
    const active = pending.get(String(body?.previewId))
    if (active && active.owner === c.req.header('x-friday-csrf')) active.controller.abort()
    return c.json({ cancelled: true })
  })
  app.post('/api/sources', security.mutationGuard, async (c) => {
    let release: (() => Promise<void>) | undefined
    try {
      const body = await c.req.json() as { previewId?: unknown }
      const ticket = tickets.get(String(body?.previewId))
      if (!ticket || ticket.owner !== c.req.header('x-friday-csrf') || ticket.expires < Date.now()) throw new Error('Preview expired or cancelled; preview again')
      const scope = parse(body)
      if (JSON.stringify([scope.path, scope.host, scope.exclusions]) !== JSON.stringify([ticket.path, ticket.host, ticket.exclusions])) throw new Error('Scope changed; preview again')
      const generation = generations.get(scope.path) ?? 0
      if (generation !== ticket.generation) throw new Error('Source permission changed; preview again')
      const nativeLease = process.platform === 'win32' ? await nativePreview(scope.path, dataHome, '--hold') : undefined
      release = nativeLease?.release
      const leaseDeadline = nativeLease ? Date.now() + 15_000 : undefined
      if (nativeLease) await adapters.onNativeHold?.(nativeLease.release)
      const native = nativeLease?.value
      const checked = native ? { ...scope, nativePath: native.nativePath } : await validate(scope, dataHome)
      if (!tickets.has(ticket.id)) throw new Error('Preview cancelled or source permission changed; preview again')
      if (generation !== (generations.get(scope.path) ?? 0) || checked.nativePath !== ticket.nativePath || (native && native.identity !== ticket.identity)) throw new Error('Folder identity changed; preview again')
      const source: Source = { ...checked, id: randomUUID(), enabled: true, revision: 1, health: 'ready', ...(native ? { identity: native.identity } : {}) }
      const saved = await store.approveSource(ticket.id, ticket.owner, source, native?.identity, generation, leaseDeadline, nativeLease?.lease)
      tickets.delete(ticket.id)
      return c.json(saved)
    } catch (e) { return c.json(error(e), 400) }
    finally { await release?.() }
  })
  app.patch('/api/sources/:id', security.mutationGuard, async (c) => {
    const body = await c.req.json().catch(() => null) as { enabled?: unknown; expectedRevision?: unknown } | null
    if (body?.enabled !== false || !Number.isSafeInteger(body.expectedRevision)) return c.json({ error: 'Only disabling an exact revision is supported; refresh to retry' }, 400)
    try {
      const existing = (await store.listSources()).find((item) => item.id === c.req.param('id'))
      if (!existing || existing.revision !== body.expectedRevision) throw new Error('Source changed or was removed; refresh before disabling')
      invalidate(existing.path)
      invalidate(existing.nativePath)
      await store.invalidateApprovals([existing.path, existing.nativePath])
      const disabled = await store.disableSource(c.req.param('id'), body.expectedRevision as number)
      for (const [id, ticket] of tickets) if (ticket.nativePath === disabled.nativePath) tickets.delete(id)
      return c.json(disabled)
    }
    catch (e) { return c.json(error(e), 409) }
  })
  app.delete('/api/sources/:id', security.mutationGuard, async (c) => {
    const source = (await store.listSources()).find((item) => item.id === c.req.param('id'))
    if (source) { invalidate(source.path); invalidate(source.nativePath) }
    if (source) await store.invalidateApprovals([source.path, source.nativePath])
    return c.json({ revoked: await store.revokeSource(c.req.param('id')) })
  })
  return () => { tickets.clear(); for (const request of pending.values()) request.controller.abort(); for (const job of inventoryJobs.values()) job.abort() }
}
