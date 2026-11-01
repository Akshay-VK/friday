import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, symlink, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { startFriday } from '../src/server/start.ts'
import { bootstrap, mutationHeaders } from './helpers/harness.ts'

test('native Windows fixture: handle-bound preview, unchanged hidden files, identity approval, disable and revoke', async (t) => {
  assert.equal(process.platform, 'win32', 'Run only with native Windows Node and separately installed dependencies')
  const base = await mkdtemp(join(tmpdir(), 'friday-native-source-'))
  const root = join(base, 'root')
  const home = join(base, 'home')
  const outside = join(base, 'outside')
  await mkdir(root)
  await mkdir(home)
  await mkdir(join(home, 'child'))
  await mkdir(outside)
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'config'), 'untouched hidden configuration')
  await writeFile(join(root, 'normal.txt'), 'untouched ordinary fixture')
  await symlink(outside, join(root, 'escape'), 'junction')
  await symlink(root, join(root, 'cycle'), 'junction')
  await symlink(root, join(base, 'root-alias'), 'junction')
  let proceed: (() => void) | undefined
  const snapshot = async () => {
    const names = await readdir(root)
    return { names, metadata: await Promise.all(names.map(async (name) => { const stat = await lstat(join(root, name)); return [name, stat.size, stat.mtimeMs, stat.isSymbolicLink()] })),
      hidden: await readFile(join(root, '.git', 'config'), 'utf8'), ordinary: await readFile(join(root, 'normal.txt'), 'utf8') }
  }
  const before = await snapshot()
  let holdNext: { entered: () => void; proceed: Promise<void>; interrupt?: boolean } | undefined
  const host = await startFriday({ dataHome: home, port: 0, sourceAdapters: { onNativeHold: async (stop) => {
    const held = holdNext
    if (held) { holdNext = undefined; held.entered(); await held.proceed; if (held.interrupt) await stop() }
  } } })
  t.after(async () => { proceed?.(); await host.close(); await rm(base, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const mutate = (method: string, route: string, body: object) => fetch(`${host.url}/api/sources${route}`, { method, headers, body: JSON.stringify(body) })
  const scope = { path: root, host: 'windows', exclusions: ['.git'] }
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  const first = await mutate('POST', '/preview', scope)
  assert.equal(first.status, 200, await first.clone().text())
  const preview = await first.json() as { previewId: string; sample: string[]; skipped: string[]; truncated: boolean }
  assert.ok(preview.sample.includes('normal.txt'))
  assert.ok(!preview.sample.includes('.git'))
  assert.ok(preview.skipped.includes('escape') && preview.skipped.includes('cycle'))
  assert.equal(preview.truncated, false)
  assert.ok(preview.sample.length + preview.skipped.length <= 48)
  assert.equal((await mutate('POST', '/cancel', { previewId: preview.previewId })).status, 200)
  assert.notEqual((await mutate('POST', '', { ...scope, previewId: preview.previewId })).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  const sibling = join(base, 'root2')
  await mkdir(sibling)
  for (let i = 0; i < 52; i++) await writeFile(join(sibling, `entry-${i.toString().padStart(2, '0')}`), '')
  const siblingResponse = await mutate('POST', '/preview', { ...scope, path: sibling })
  assert.equal(siblingResponse.status, 200, 'sibling prefix is not containment')
  const bounded = await siblingResponse.json() as { sample: string[]; truncated: boolean }
  assert.equal(bounded.truncated, true)
  assert.ok(bounded.sample.length <= 48)
  for (const path of [home, base, join(home, 'child'), outside + '\\..\\root', 'C:relative', 'C:\\PROGRA~1', '\\\\server\\share', join(root, 'escape'), join(base, 'root-alias', '.git')]) {
    assert.notEqual((await mutate('POST', '/preview', { ...scope, path })).status, 200, path)
  }
  const second = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  const swapped = join(base, 'old-root')
  await rename(root, swapped)
  await mkdir(root)
  assert.notEqual((await mutate('POST', '', { ...scope, previewId: second.previewId })).status, 200, 'replacement root must fail approval')
  await rm(root, { recursive: true, force: true })
  await rename(swapped, root)
  const contested = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  const approvals = await Promise.all([mutate('POST', '', { ...scope, previewId: contested.previewId }), mutate('POST', '', { ...scope, previewId: contested.previewId })])
  assert.deepEqual(approvals.map((result) => result.status).sort(), [200, 400], 'one preview cannot produce two grants')
  const contestedGrant = await approvals.find((result) => result.status === 200)!.json() as { id: string }
  assert.equal((await mutate('DELETE', `/${contestedGrant.id}`, {})).status, 200)
  const third = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  const grantResponse = await mutate('POST', '', { ...scope, previewId: third.previewId })
  assert.equal(grantResponse.status, 200, await grantResponse.clone().text())
  const grant = await grantResponse.json() as { id: string; revision: number }
  assert.equal((await mutate('PATCH', `/${grant.id}`, { enabled: false, expectedRevision: grant.revision })).status, 200)
  assert.equal((await mutate('DELETE', `/${grant.id}`, {})).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  // Rendezvous after native validation, while its handles are still open.
  const fourth = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  let entered!: () => void
  let reached = new Promise<void>((resolve) => { entered = resolve })
  let release = new Promise<void>((resolve) => { proceed = resolve })
  holdNext = { entered, proceed: release }
  const awaiting = mutate('POST', '', { ...scope, previewId: fourth.previewId })
  await reached
  await assert.rejects(rename(root, swapped), (e: unknown) => ['EPERM', 'EACCES', 'EBUSY'].includes((e as NodeJS.ErrnoException).code ?? ''))
  proceed?.()
  const fourthGrant = await awaiting
  assert.equal(fourthGrant.status, 200, await fourthGrant.clone().text())
  assert.equal((await mutate('DELETE', `/${(await fourthGrant.json() as { id: string }).id}`, {})).status, 200)
  const cancelled = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  reached = new Promise<void>((resolve) => { entered = resolve })
  release = new Promise<void>((resolve) => { proceed = resolve })
  holdNext = { entered, proceed: release }
  const interrupted = mutate('POST', '', { ...scope, previewId: cancelled.previewId })
  await reached
  assert.equal((await mutate('POST', '/cancel', { previewId: cancelled.previewId })).status, 200)
  proceed?.()
  assert.notEqual((await interrupted).status, 200, 'cancel during validation must not persist a grant')
  const broken = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  reached = new Promise<void>((resolve) => { entered = resolve })
  release = new Promise<void>((resolve) => { proceed = resolve })
  holdNext = { entered, proceed: release, interrupt: true }
  const lostHelper = mutate('POST', '', { ...scope, previewId: broken.previewId })
  await reached
  proceed?.()
  assert.notEqual((await lostHelper).status, 200, 'interrupted helper cannot authorize a grant')
  // A severed parent/process must not leave OS handles behind.
  const helper = spawn(join(process.cwd(), 'native', 'source-preview.exe'), ['--hold', root, home], { stdio: ['pipe', 'pipe', 'pipe'] })
  await new Promise<void>((resolve, reject) => {
    helper.once('error', reject)
    helper.stdout!.once('data', () => resolve())
  })
  await assert.rejects(rename(root, swapped), (e: unknown) => ['EPERM', 'EACCES', 'EBUSY'].includes((e as NodeJS.ErrnoException).code ?? ''))
  helper.kill()
  await new Promise<void>((resolve) => helper.once('close', () => resolve()))
  await rename(root, swapped)
  await rename(swapped, root)
  assert.deepEqual(await snapshot(), before, 'no fixture contents or metadata changed by preview/approval')
})

test('native Windows TEMP inventory API commits only complete current grants and kills stalled helper', async (t) => {
  assert.equal(process.platform, 'win32')
  const base = await mkdtemp(join(tmpdir(), 'friday-inventory-api-'))
  const root = join(base, 'root'), home = join(base, 'home')
  await mkdir(root); await mkdir(home); await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'config'), '[core]\nfixture=true')
  const before = await Promise.all([lstat(join(root, '.git')), lstat(join(root, '.git', 'config'))])
  const oldDiagnostics = process.env.FRIDAY_DIAGNOSTICS
  process.env.FRIDAY_DIAGNOSTICS = '1'
  const host = await startFriday({ dataHome: home, port: 0 })
  t.after(async () => { delete process.env.FRIDAY_TEST_INVENTORY_STALL; if (oldDiagnostics === undefined) delete process.env.FRIDAY_DIAGNOSTICS; else process.env.FRIDAY_DIAGNOSTICS = oldDiagnostics; await host.close(); await rm(base, { recursive: true, force: true }) })
  const session = await bootstrap(host.url)
  const headers = mutationHeaders(host.url, session.cookie, session.body.csrfToken)
  const scope = { path: root, host: 'windows', exclusions: [] }
  const mutate = (method: string, route: string, body: object) => fetch(`${host.url}/api/sources${route}`, { method, headers, body: JSON.stringify(body) })
  const ticket = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  const response = await mutate('POST', '', { ...scope, previewId: ticket.previewId })
  assert.equal(response.status, 200, await response.clone().text())
  const source = await response.json() as { id: string; identity: string; revision: number }
  assert.match(source.identity, /^[a-f0-9]{16}-[a-f0-9]{32}$/)
  const backup = await (await fetch(`${host.url}/api/backups/create`, { method: 'POST', headers, body: '{}' })).json() as { id: string }
  const read = () => mutate('POST', `/${source.id}/inventory`, {})
  const first = await read()
  assert.equal(first.status, 200, await first.clone().text())
  const value = await first.json() as { observations: string[]; partial: boolean }
  assert.ok(value.observations.some((line) => line.startsWith('MANIFEST ')))
  assert.equal(value.partial, false)
  assert.ok((await (await fetch(`${host.url}/api/sources/${source.id}/inventory`)).json() as { inventory: { observations: string[] } }).inventory.observations.length > 0)
  const names = Array.from({ length: 32 }, (_, i) => `long-${String(i).padStart(2, '0')}-${'z'.repeat(100)}`)
  for (const name of names) await writeFile(join(root, name), '')
  const bounded = await read()
  assert.equal(bounded.status, 200, await bounded.clone().text())
  assert.equal((await bounded.json() as { partial: boolean }).partial, true)
  for (const name of names) await rm(join(root, name))
  process.env.FRIDAY_TEST_INVENTORY_STALL = '1'
  const started = Date.now()
  const waiting = read()
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal((await read()).status, 429, 'only one native collector process at a time')
  const stalled = await waiting
  assert.equal(stalled.status, 409)
  assert.ok(Date.now() - started < 6000, 'parent kills/waits for blocking native helper')
  delete process.env.FRIDAY_TEST_INVENTORY_STALL
  const moved = join(base, 'old-root')
  await rename(root, moved); await mkdir(root)
  assert.equal((await read()).status, 409, 'replacement root is not the persisted grant')
  await rm(root, { recursive: true, force: true }); await rename(moved, root)
  process.env.FRIDAY_TEST_INVENTORY_STALL = '1'
  const pending = read()
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal((await mutate('PATCH', `/${source.id}`, { enabled: false, expectedRevision: source.revision })).status, 200)
  assert.equal((await pending).status, 409, 'disable cancels native read and refuses late commit')
  delete process.env.FRIDAY_TEST_INVENTORY_STALL
  assert.equal((await read()).status, 403)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources/${source.id}/inventory`)).json(), { inventory: null })
  assert.equal((await mutate('DELETE', `/${source.id}`, {})).status, 200)
  const plan = await (await fetch(`${host.url}/api/backups/restore-preview`, { method: 'POST', headers, body: JSON.stringify({ id: backup.id }) })).json() as { confirmation: string }
  assert.equal((await fetch(`${host.url}/api/backups/restore`, { method: 'POST', headers, body: JSON.stringify({ id: backup.id, confirmation: plan.confirmation }) })).status, 200)
  const restored = (await (await fetch(`${host.url}/api/sources`)).json() as { sources: Array<{ identity: string; enabled: boolean }> }).sources[0]
  assert.equal(restored?.identity, source.identity)
  assert.equal(restored?.enabled, false)
  assert.equal((await read()).status, 403)
  assert.equal(await readFile(join(root, '.git', 'config'), 'utf8'), '[core]\nfixture=true')
  const after = await Promise.all([lstat(join(root, '.git')), lstat(join(root, '.git', 'config'))])
  assert.deepEqual(after.map((entry) => entry.mtimeMs), before.map((entry) => entry.mtimeMs), 'native reads did not change source timestamps')
})
