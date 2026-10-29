import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bootstrap, mutationHeaders, startHarness } from './helpers/harness.ts'

test('scan roots start empty; preview is an explicit temporary read and cancel cannot approve', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'friday-source-fixture-'))
  const host = await startHarness()
  t.after(async () => { await host.stop(); await rm(root, { recursive: true, force: true }) })
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'config'), 'untouched')
  await writeFile(join(root, '.hidden'), 'untouched')
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const post = (route: string, body: object) => fetch(`${host.url}/api/sources/${route}`, { method: 'POST', headers, body: JSON.stringify(body) })
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
