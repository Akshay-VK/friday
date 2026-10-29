import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { bootstrap, mutationHeaders, startHarness, startHarnessExpectingFailure } from './helpers/harness.ts'

test('authored theme can be backed up, previewed and explicitly restored after a clean-state change', async (t) => {
  const host = await startHarness()
  t.after(() => host.stop())
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const call = async (path: string, body: object = {}) => fetch(`${host.url}/api/backups/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  await fetch(`${host.url}/api/preferences/theme`, { method: 'PUT', headers, body: JSON.stringify({ value: 'dark' }) })
  const created = await call('create')
  assert.equal(created.status, 200)
  const backup = await created.json() as { id: string; counts: { preferences: number } }
  assert.equal(backup.counts.preferences, 1)
  const files = await readdir(join(host.dataHome, 'backups', backup.id))
  assert.deepEqual(files.sort(), ['manifest.json', 'state.sqlite'])
  const manifest = JSON.parse(await readFile(join(host.dataHome, 'backups', backup.id, 'manifest.json'), 'utf8')) as { checksum: string; schemaVersion: number }
  assert.match(manifest.checksum, /^[a-f0-9]{64}$/)
  assert.equal(manifest.schemaVersion, 2)
  await fetch(`${host.url}/api/preferences/theme`, { method: 'PUT', headers, body: JSON.stringify({ value: 'system' }) })
  const preview = await call('restore-preview', { id: backup.id })
  assert.equal(preview.status, 200)
  const plan = await preview.json() as { confirmation: string; currentTheme: string; restoredTheme: string }
  assert.equal(plan.currentTheme, 'system')
  assert.equal(plan.restoredTheme, 'dark')
  assert.equal((await call('restore', { id: backup.id })).status, 400)
  assert.equal((await call('restore', { id: backup.id, confirmation: plan.confirmation })).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'dark' })
  assert.ok((await readdir(join(host.dataHome, 'backups'))).length >= 2, 'pre-restore snapshot preserved')
})

test('corrupt snapshot cannot replace current authored state', async (t) => {
  const host = await startHarness()
  t.after(() => host.stop())
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const created = await fetch(`${host.url}/api/backups/create`, { method: 'POST', headers, body: '{}' })
  const { id } = await created.json() as { id: string }
  await writeFile(join(host.dataHome, 'backups', id, 'state.sqlite'), 'broken')
  const response = await fetch(`${host.url}/api/backups/restore-preview`, { method: 'POST', headers, body: JSON.stringify({ id }) })
  assert.equal(response.status, 400)
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'system' })
})

test('backup mutations reject missing CSRF and cross-origin requests', async (t) => {
  const host = await startHarness()
  t.after(() => host.stop())
  const session = await bootstrap(host.url)
  const missing = await fetch(`${host.url}/api/backups/create`, { method: 'POST', headers: { Cookie: session.cookie, Origin: host.url }, body: '{}' })
  assert.notEqual(missing.status, 200)
  const foreign = await fetch(`${host.url}/api/backups/create`, { method: 'POST', headers: { ...mutationHeaders(host.url, session.cookie, session.body.csrfToken), Origin: 'https://example.invalid' }, body: '{}' })
  assert.notEqual(foreign.status, 200)
})

test('daily catch-up retains seven daily and four distinct weekly copies', async (t) => {
  const host = await startHarness({ env: { FRIDAY_DIAGNOSTICS: '1', FRIDAY_TEST_NOW: '2026-01-01T00:00:00.000Z' } })
  t.after(() => host.stop())
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  for (let day = 0; day < 85; day++) {
    const at = new Date(Date.UTC(2026, 0, 1 + day)).toISOString()
    const response = await fetch(`${host.url}/api/diagnostics/daily-backup`, { method: 'POST', headers, body: JSON.stringify({ now: at }) })
    assert.equal(response.status, 200)
  }
  const state = await (await fetch(`${host.url}/api/backups`)).json() as { backups: Array<{ kind: string; createdAt: string }> }
  assert.equal(state.backups.filter((item) => item.kind === 'daily').length, 7)
  assert.equal(state.backups.filter((item) => item.kind === 'weekly').length, 4)
  const latest = state.backups.filter((item) => item.kind === 'daily').map((item) => item.createdAt.slice(0, 10)).sort()
  assert.deepEqual(latest, ['2026-03-20', '2026-03-21', '2026-03-22', '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26'])
})

test('storage exhaustion refuses publication and preserves the last valid snapshot and current preference', async (t) => {
  const host = await startHarness({ env: { FRIDAY_DIAGNOSTICS: '1', FRIDAY_TEST_BACKUP_FAILURE: 'ENOSPC' } })
  t.after(() => host.stop())
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const response = await fetch(`${host.url}/api/backups/create`, { method: 'POST', headers, body: '{}' })
  assert.equal(response.status, 503)
  assert.match((await response.json() as { error: string }).error, /free space/)
  const state = await (await fetch(`${host.url}/api/backups`)).json() as { backups: unknown[]; lastFailure: string }
  assert.equal(state.backups.length, 0)
  assert.match(state.lastFailure, /free space/)
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'system' })
})

test('a new clean home restores a snapshot without rebuilding derived data from the copy', async (t) => {
  const source = await startHarness()
  t.after(() => source.stop())
  const session = await bootstrap(source.url)
  const headers = mutationHeaders(source.url, session.cookie, session.body.csrfToken)
  await fetch(`${source.url}/api/preferences/theme`, { method: 'PUT', headers, body: JSON.stringify({ value: 'dark' }) })
  const { id } = await (await fetch(`${source.url}/api/backups/create`, { method: 'POST', headers, body: '{}' })).json() as { id: string }
  const cleanHome = await mkdtemp(join(tmpdir(), 'friday-clean-'))
  await mkdir(join(cleanHome, 'backups'))
  await cp(join(source.dataHome, 'backups', id), join(cleanHome, 'backups', id), { recursive: true })
  const clean = await startHarness({ dataHome: cleanHome, keepDataHome: true })
  t.after(async () => { await clean.stop(); await rm(cleanHome, { recursive: true, force: true }) })
  const fresh = await bootstrap(clean.url)
  const preview = await (await fetch(`${clean.url}/api/backups/restore-preview`, { method: 'POST', headers: mutationHeaders(clean.url, fresh.cookie, fresh.body.csrfToken), body: JSON.stringify({ id }) })).json() as { confirmation: string }
  const restored = await fetch(`${clean.url}/api/backups/restore`, { method: 'POST', headers: mutationHeaders(clean.url, fresh.cookie, fresh.body.csrfToken), body: JSON.stringify({ id, confirmation: preview.confirmation }) })
  assert.equal(restored.status, 200)
  assert.deepEqual(await (await fetch(`${clean.url}/api/preferences/theme`)).json(), { theme: 'dark' })
  assert.equal((await (await fetch(`${clean.url}/api/search?q=serv`)).json() as { results: unknown[] }).results.length, 1)
})

test('known v1 store migration is protected and a newer schema is never downgraded', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'friday-v1-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const db = new Database(join(home, 'friday.sqlite'))
  db.exec("CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL); INSERT INTO preferences VALUES ('theme','dark',1,'2026-01-01T00:00:00.000Z'); CREATE TABLE action_registry (id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, harmless INTEGER NOT NULL); CREATE VIRTUAL TABLE action_search USING fts5(id UNINDEXED, label, description); PRAGMA user_version=1;")
  db.close()
  const host = await startHarness({ dataHome: home, keepDataHome: true })
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'dark' })
  const backups = await (await fetch(`${host.url}/api/backups`)).json() as { backups: Array<{ kind: string }> }
  assert.equal(backups.backups.filter((item) => item.kind === 'pre-migration').length, 1)
  await host.stop()
  const newer = new Database(join(home, 'friday.sqlite'))
  newer.pragma('user_version=99')
  newer.close()
  const failure = await startHarnessExpectingFailure({ dataHome: home })
  assert.notEqual(failure.code, 0)
  assert.match(failure.stderr, /newer than this Friday version/)
  const unchanged = new Database(join(home, 'friday.sqlite'), { readonly: true })
  assert.equal(unchanged.pragma('user_version', { simple: true }), 99)
  assert.equal((unchanged.prepare("SELECT value FROM preferences WHERE key='theme'").get() as { value: string }).value, 'dark')
  unchanged.close()
})

test('a failed pre-restore protection refuses replacement and leaves the preference intact', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'friday-protect-'))
  const first = await startHarness({ dataHome: home, keepDataHome: true })
  const firstSession = await bootstrap(first.url)
  const firstHeaders = mutationHeaders(first.url, firstSession.cookie, firstSession.body.csrfToken)
  await fetch(`${first.url}/api/preferences/theme`, { method: 'PUT', headers: firstHeaders, body: JSON.stringify({ value: 'dark' }) })
  const { id } = await (await fetch(`${first.url}/api/backups/create`, { method: 'POST', headers: firstHeaders, body: '{}' })).json() as { id: string }
  await fetch(`${first.url}/api/preferences/theme`, { method: 'PUT', headers: firstHeaders, body: JSON.stringify({ value: 'light' }) })
  await first.stop()
  const host = await startHarness({ dataHome: home, keepDataHome: true, env: { FRIDAY_DIAGNOSTICS: '1', FRIDAY_TEST_BACKUP_FAILURE: 'ENOSPC' } })
  t.after(async () => { await host.stop(); await rm(home, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const plan = await (await fetch(`${host.url}/api/backups/restore-preview`, { method: 'POST', headers, body: JSON.stringify({ id }) })).json() as { confirmation: string }
  const restore = await fetch(`${host.url}/api/backups/restore`, { method: 'POST', headers, body: JSON.stringify({ id, confirmation: plan.confirmation }) })
  assert.equal(restore.status, 400)
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'light' })
  const copies = await (await fetch(`${host.url}/api/backups`)).json() as { backups: Array<{ kind: string }> }
  assert.equal(copies.backups.filter((item) => item.kind === 'pre-restore').length, 0)
})

test('incompatible metadata and stale confirmation are rejected without replacement', async (t) => {
  const host = await startHarness()
  t.after(() => host.stop())
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const call = async (path: string, body: object) => fetch(`${host.url}/api/backups/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const { id } = await (await call('create', {})).json() as { id: string }
  const preview = await (await call('restore-preview', { id })).json() as { confirmation: string }
  await fetch(`${host.url}/api/preferences/theme`, { method: 'PUT', headers, body: JSON.stringify({ value: 'dark' }) })
  assert.equal((await call('restore', { id, confirmation: preview.confirmation })).status, 400)
  const file = join(host.dataHome, 'backups', id, 'manifest.json')
  const manifest = JSON.parse(await readFile(file, 'utf8')) as { schemaVersion: number }
  manifest.schemaVersion = 999
  await writeFile(file, JSON.stringify(manifest))
  assert.equal((await call('restore-preview', { id })).status, 400)
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'dark' })
})

test('interrupted staging is invisible and the last published backup remains restorable', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'friday-interrupted-'))
  const first = await startHarness({ dataHome: home, keepDataHome: true })
  const session = await bootstrap(first.url)
  const headers = mutationHeaders(first.url, session.cookie, session.body.csrfToken)
  const { id } = await (await fetch(`${first.url}/api/backups/create`, { method: 'POST', headers, body: '{}' })).json() as { id: string }
  await first.stop()
  const interrupted = join(home, 'backups', '.00000000-0000-4000-8000-000000000000.pending')
  await mkdir(interrupted)
  await writeFile(join(interrupted, 'state.sqlite'), 'partial publication')
  const host = await startHarness({ dataHome: home, keepDataHome: true })
  t.after(async () => { await host.stop(); await rm(home, { recursive: true, force: true }) })
  const listing = await (await fetch(`${host.url}/api/backups`)).json() as { backups: Array<{ id: string }> }
  assert.ok(listing.backups.some((item) => item.id === id))
  assert.ok(listing.backups.every((item) => !item.id.includes('pending')))
  const fresh = await bootstrap(host.url)
  const preview = await fetch(`${host.url}/api/backups/restore-preview`, { method: 'POST', headers: mutationHeaders(host.url, fresh.cookie, fresh.body.csrfToken), body: JSON.stringify({ id }) })
  assert.equal(preview.status, 200)
})

test('migration interruption leaves v1 authored state and a validated pre-migration copy for recovery', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'friday-migration-stop-'))
  const db = new Database(join(home, 'friday.sqlite'))
  db.exec("CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL); INSERT INTO preferences VALUES ('theme','dark',1,'2026-01-01T00:00:00.000Z'); CREATE TABLE action_registry (id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, harmless INTEGER NOT NULL); CREATE VIRTUAL TABLE action_search USING fts5(id UNINDEXED, label, description); PRAGMA user_version=1;")
  db.close()
  const interrupted = await startHarnessExpectingFailure({ dataHome: home, env: { FRIDAY_DIAGNOSTICS: '1', FRIDAY_TEST_MIGRATION_FAILURE: '1' } })
  assert.notEqual(interrupted.code, 0)
  const old = new Database(join(home, 'friday.sqlite'), { readonly: true })
  assert.equal(old.pragma('user_version', { simple: true }), 1)
  assert.equal((old.prepare("SELECT value FROM preferences WHERE key='theme'").get() as { value: string }).value, 'dark')
  old.close()
  const host = await startHarness({ dataHome: home, keepDataHome: true })
  t.after(async () => { await host.stop(); await rm(home, { recursive: true, force: true }) })
  assert.deepEqual(await (await fetch(`${host.url}/api/preferences/theme`)).json(), { theme: 'dark' })
  const state = await (await fetch(`${host.url}/api/backups`)).json() as { backups: Array<{ kind: string }> }
  assert.ok(state.backups.some((item) => item.kind === 'pre-migration'))
})

test('a changed migration record refuses startup without silently rewriting authored data', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'friday-migration-record-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const host = await startHarness({ dataHome: home, keepDataHome: true })
  await host.stop()
  const db = new Database(join(home, 'friday.sqlite'))
  db.prepare("UPDATE migration_history SET checksum = 'tampered' WHERE version = 2").run()
  db.close()
  const failed = await startHarnessExpectingFailure({ dataHome: home })
  assert.notEqual(failed.code, 0)
  assert.match(failed.stderr, /migration record/)
  const current = new Database(join(home, 'friday.sqlite'), { readonly: true })
  assert.equal(current.pragma('user_version', { simple: true }), 2)
  current.close()
})
