import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bootstrap, mutationHeaders, startHarness } from './helpers/harness.ts'
import { startFriday } from '../src/server/start.ts'

test('scan roots start empty; preview is an explicit temporary read and cancel cannot approve', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const host = await startHarness()
  t.after(async () => { await host.stop(); await rm(root, { recursive: true, force: true }) })
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'config'), 'untouched')
  await writeFile(join(root, '.hidden'), 'untouched')
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const post = (route: string, body: object) => fetch(`${host.url}/api/sources${route ? `/${route}` : ''}`, { method: 'POST', headers, body: JSON.stringify(body) })
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  assert.equal((await post('preview', { path: root, host: 'local', exclusions: ['.git'] })).status, 200)
  const preview = await (await post('preview', { path: root, host: 'local', exclusions: ['.git'] })).json() as { previewId: string; sample: string[] }
  assert.ok(preview.sample.includes('.hidden'))
  assert.ok(!preview.sample.includes('.git'))
  assert.equal((await post('cancel', { previewId: preview.previewId })).status, 200)
  assert.notEqual((await post('', { previewId: preview.previewId, path: root, host: 'local', exclusions: ['.git'] })).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  assert.equal(await readFile(join(root, '.git', 'config'), 'utf8'), 'untouched')
  assert.equal(await readFile(join(root, '.hidden'), 'utf8'), 'untouched')
})

test('approval saves exact scope; disable and revoke block further reads; backup restores authored grant disabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const host = await startHarness()
  t.after(async () => { await host.stop(); await rm(root, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const mutate = (route: string, method: string, body: object) => fetch(`${host.url}/api/${route}`, { method, headers, body: JSON.stringify(body) })
  const preview = await (await mutate('sources/preview', 'POST', { path: root, host: 'local', exclusions: [] })).json() as { previewId: string }
  const approved = await mutate('sources', 'POST', { previewId: preview.previewId, path: root, host: 'local', exclusions: [] })
  assert.equal(approved.status, 200)
  const source = await approved.json() as { id: string; revision: number; enabled: boolean }
  assert.equal(source.enabled, true)
  const backup = await (await mutate('backups/create', 'POST', {})).json() as { id: string; counts: { sources: number } }
  assert.equal(backup.counts.sources, 1)
  const disabled = await mutate(`sources/${source.id}`, 'PATCH', { enabled: false, expectedRevision: source.revision })
  assert.equal(disabled.status, 200)
  assert.equal((await mutate(`sources/${source.id}`, 'DELETE', {})).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  const plan = await (await mutate('backups/restore-preview', 'POST', { id: backup.id })).json() as { confirmation: string }
  assert.equal((await mutate('backups/restore', 'POST', { id: backup.id, confirmation: plan.confirmation })).status, 200)
  const restored = await (await fetch(`${host.url}/api/sources`)).json() as { sources: Array<{ path: string; enabled: boolean; exclusions: string[] }> }
  assert.equal(restored.sources.length, 1)
  assert.equal(restored.sources[0]?.path, root)
  assert.equal(restored.sources[0]?.enabled, false)
})

test('invalid paths, excluded links, overlap and hostile mutations never grant scope', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const host = await startHarness()
  t.after(async () => { await host.stop(); await rm(root, { recursive: true, force: true }) })
  await symlink(host.dataHome, join(root, 'linked-home'), 'dir')
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const preview = (path: string, extra: object = {}) => fetch(`${host.url}/api/sources/preview`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ path, host: 'local', exclusions: [] }) })
  for (const invalid of ['relative', '../relative', root + '/../escape', host.dataHome, join(host.dataHome, 'backups'), root + '2']) {
    assert.notEqual((await preview(invalid)).status, 200, invalid)
  }
  assert.equal((await preview(root, { Origin: 'https://example.invalid' })).status, 403)
  const result = await preview(root)
  assert.equal(result.status, 200)
  const body = await result.json() as { skipped: string[] }
  assert.ok(body.skipped.includes('linked-home'))
})

test('cancel and disable fence in-flight preview reads and reject late results', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  await writeFile(join(root, 'held'), '')
  let entered!: () => void
  let release!: () => void
  const reached = new Promise<void>((resolve) => { entered = resolve })
  const held = new Promise<void>((resolve) => { release = resolve })
  let block = false
  let inspected = 0
  let reads = 0
  const host = await startFriday({ dataHome: await mkdtemp(join(tmpdir(), 'friday-fixture-home-')), port: 0, sourceAdapters: {
    inspectEntry: async (path, signal) => {
      inspected++
      if (block) { entered(); await held }
      if (signal.aborted) throw new Error('Read cancelled before entry access')
      reads++
      return (await import('node:fs/promises')).lstat(path)
    },
  } })
  t.after(async () => { release(); await host.close(); await rm(root, { recursive: true, force: true }); await rm(host.dataHome, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const post = (route: string, body: object) => fetch(`${host.url}/api/sources${route ? `/${route}` : ''}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const scope = { path: root, host: 'local', exclusions: [] }
  const first = await (await post('preview', scope)).json() as { previewId: string }
  const approved = await (await post('', { ...scope, previewId: first.previewId })).json() as { id: string; revision: number }
  block = true
  const requestId = crypto.randomUUID()
  const late = post('preview', { ...scope, requestId })
  await reached
  assert.equal((await post('cancel', { previewId: requestId })).status, 200)
  const disabled = await fetch(`${host.url}/api/sources/${approved.id}`, { method: 'PATCH', headers, body: JSON.stringify({ enabled: false, expectedRevision: approved.revision }) })
  assert.equal(disabled.status, 200)
  release()
  assert.notEqual((await late).status, 200)
  assert.notEqual((await post('', { ...scope, previewId: requestId })).status, 200)
  assert.equal(inspected, 2)
  assert.equal(reads, 1)
  const remaining = await (await fetch(`${host.url}/api/sources`)).json() as { sources: Array<{ enabled: boolean }> }
  assert.equal(remaining.sources[0]?.enabled, false)
})

test('revocation fences a pending preview, and approved offline roots retain recovery state', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  await writeFile(join(root, 'held'), '')
  let entered!: () => void
  let release!: () => void
  const reached = new Promise<void>((resolve) => { entered = resolve })
  const held = new Promise<void>((resolve) => { release = resolve })
  let block = false
  const home = await mkdtemp(join(tmpdir(), 'friday-fixture-home-'))
  const host = await startFriday({ dataHome: home, port: 0, sourceAdapters: { inspectEntry: async (path, signal) => { if (block) { entered(); await held }; if (signal.aborted) throw new Error('Read cancelled before entry access'); return (await import('node:fs/promises')).lstat(path) } } })
  t.after(async () => { release(); await host.close(); await rm(root, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const post = (route: string, body: object) => fetch(`${host.url}/api/sources${route ? `/${route}` : ''}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const scope = { path: root, host: 'local', exclusions: [] }
  const first = await (await post('preview', scope)).json() as { previewId: string }
  const approved = await (await post('', { ...scope, previewId: first.previewId })).json() as { id: string }
  const moved = `${root}-offline`
  await (await import('node:fs/promises')).rename(root, moved)
  t.after(() => rm(moved, { recursive: true, force: true }))
  const offline = await (await fetch(`${host.url}/api/sources`)).json() as { sources: Array<{ health: string; enabled: boolean }> }
  assert.equal(offline.sources[0]?.health, 'offline')
  assert.equal(offline.sources[0]?.enabled, true)
  await (await import('node:fs/promises')).rename(moved, root)
  assert.equal(((await (await fetch(`${host.url}/api/sources`)).json()) as { sources: Array<{ health: string }> }).sources[0]?.health, 'ready')
  block = true
  const requestId = crypto.randomUUID()
  const late = post('preview', { ...scope, requestId })
  await reached
  assert.equal((await fetch(`${host.url}/api/sources/${approved.id}`, { method: 'DELETE', headers, body: '{}' })).status, 200)
  release()
  assert.notEqual((await late).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
})

test('cancel alone prevents a pending preview from reading after cancellation or issuing a ticket', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const home = await mkdtemp(join(tmpdir(), 'friday-fixture-home-'))
  await writeFile(join(root, 'held'), '')
  let entered!: () => void
  let release!: () => void
  const reached = new Promise<void>((resolve) => { entered = resolve })
  const held = new Promise<void>((resolve) => { release = resolve })
  let reads = 0
  const host = await startFriday({ dataHome: home, port: 0, sourceAdapters: { inspectEntry: async (path, signal) => {
    entered()
    await held
    if (signal.aborted) throw new Error('Cancelled before fixture entry read')
    reads++
    return (await import('node:fs/promises')).lstat(path)
  } } })
  t.after(async () => { release(); await host.close(); await rm(root, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const requestId = crypto.randomUUID()
  const scope = { path: root, host: 'local', exclusions: [] }
  const pending = fetch(`${host.url}/api/sources/preview`, { method: 'POST', headers, body: JSON.stringify({ ...scope, requestId }) })
  await reached
  assert.equal((await fetch(`${host.url}/api/sources/cancel`, { method: 'POST', headers, body: JSON.stringify({ previewId: requestId }) })).status, 200)
  release()
  assert.equal((await pending).status, 400)
  assert.equal(reads, 0)
  assert.notEqual((await fetch(`${host.url}/api/sources`, { method: 'POST', headers, body: JSON.stringify({ ...scope, previewId: requestId }) })).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
})

test('controlled picker adapter selection and cancellation never grant permission', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'friday-fixture-home-'))
  const root = await mkdtemp(join(tmpdir(), 'friday-picker-fixture-'))
  let next: 'selected' | 'cancelled' = 'selected'
  const host = await startFriday({ dataHome: home, port: 0, sourceAdapters: { pick: async () => next === 'selected' ? { kind: 'selected', path: root } : { kind: 'cancelled' } } })
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const pick = async () => (await fetch(`${host.url}/api/sources/pick`, { method: 'POST', headers, body: '{}' })).json()
  assert.deepEqual(await pick(), { kind: 'selected', path: root })
  next = 'cancelled'
  assert.deepEqual(await pick(), { kind: 'cancelled' })
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  const unsupported = await fetch(`${host.url}/api/sources/preview`, { method: 'POST', headers, body: JSON.stringify({ path: '/home/example', host: 'wsl', distro: 'example', exclusions: [] }) })
  assert.equal((await unsupported.json() as { code: string }).code, 'WSL_MAPPING_UNVERIFIED')
})

test('approved denied root remains visible without accessing entries and recovers when access returns', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const home = await mkdtemp(join(tmpdir(), 'friday-fixture-home-'))
  let denied = false
  const host = await startFriday({ dataHome: home, port: 0, sourceAdapters: { checkRoot: async (path) => {
    if (denied) throw Object.assign(new Error('Fixture denied'), { code: 'EACCES' })
    return (await import('node:fs/promises')).lstat(path)
  } } })
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const scope = { path: root, host: 'local', exclusions: [] }
  const preview = await (await fetch(`${host.url}/api/sources/preview`, { method: 'POST', headers, body: JSON.stringify(scope) })).json() as { previewId: string }
  assert.equal((await fetch(`${host.url}/api/sources`, { method: 'POST', headers, body: JSON.stringify({ ...scope, previewId: preview.previewId }) })).status, 200)
  denied = true
  const sources = async () => (await (await fetch(`${host.url}/api/sources`)).json() as { sources: Array<{ health: string; enabled: boolean }> }).sources
  assert.deepEqual((await sources()).map((source) => [source.health, source.enabled]), [['denied', true]])
  denied = false
  assert.deepEqual((await sources()).map((source) => [source.health, source.enabled]), [['ready', true]])
})

test('bounded fixture preview operates under an enforced source write denial, including hidden entries', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const home = await mkdtemp(join(tmpdir(), 'friday-fixture-home-'))
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.hidden'), 'private fixture')
  await writeFile(join(root, '.git', 'config'), 'unchanged')
  const host = await startHarness({ dataHome: home, keepDataHome: true, nodeArgs: ['--permission', '--allow-worker', '--allow-addons', '--allow-fs-read=*', `--allow-fs-write=${home}`] })
  t.after(async () => { await host.stop(); await rm(root, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const response = await fetch(`${host.url}/api/sources/preview`, { method: 'POST', headers, body: JSON.stringify({ path: root, host: 'local', exclusions: ['.git'] }) })
  assert.equal(response.status, 200)
  const result = await response.json() as { sample: string[] }
  assert.ok(result.sample.includes('.hidden'))
  assert.ok(!result.sample.includes('.git'))
  assert.equal(await readFile(join(root, '.hidden'), 'utf8'), 'private fixture')
  assert.equal(await readFile(join(root, '.git', 'config'), 'utf8'), 'unchanged')
})
