import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, symlink, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
  const snapshot = async () => {
    const names = await readdir(root)
    return { names, metadata: await Promise.all(names.map(async (name) => { const stat = await lstat(join(root, name)); return [name, stat.size, stat.mtimeMs, stat.isSymbolicLink()] })),
      hidden: await readFile(join(root, '.git', 'config'), 'utf8'), ordinary: await readFile(join(root, 'normal.txt'), 'utf8') }
  }
  const before = await snapshot()
  const host = await startFriday({ dataHome: home, port: 0 })
  t.after(async () => { await host.close(); await rm(base, { recursive: true, force: true }) })
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
  const third = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  const grantResponse = await mutate('POST', '', { ...scope, previewId: third.previewId })
  assert.equal(grantResponse.status, 200, await grantResponse.clone().text())
  const grant = await grantResponse.json() as { id: string; revision: number }
  assert.equal((await mutate('PATCH', `/${grant.id}`, { enabled: false, expectedRevision: grant.revision })).status, 200)
  assert.equal((await mutate('DELETE', `/${grant.id}`, {})).status, 200)
  assert.deepEqual(await (await fetch(`${host.url}/api/sources`)).json(), { sources: [] })
  assert.deepEqual(await snapshot(), before, 'no fixture contents or metadata changed by preview/approval')
})
