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
  const snapshot = async () => {
    const names = await readdir(root)
    return { names, metadata: await Promise.all(names.map(async (name) => { const stat = await lstat(join(root, name)); return [name, stat.size, stat.mtimeMs, stat.isSymbolicLink()] })),
      hidden: await readFile(join(root, '.git', 'config'), 'utf8'), ordinary: await readFile(join(root, 'normal.txt'), 'utf8') }
  }
  const before = await snapshot()
  const previousDiagnostics = process.env.FRIDAY_DIAGNOSTICS
  process.env.FRIDAY_DIAGNOSTICS = '1'
  const host = await startFriday({ dataHome: home, port: 0 })
  if (previousDiagnostics === undefined) delete process.env.FRIDAY_DIAGNOSTICS
  else process.env.FRIDAY_DIAGNOSTICS = previousDiagnostics
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
  // Queue the grant behind a real store operation. Once the helper has opened
  // its handles, the root must remain non-renamable until the grant is saved.
  const fourth = await (await mutate('POST', '/preview', scope)).json() as { previewId: string }
  const busy = fetch(`${host.url}/api/diagnostics/store-busy`, { method: 'POST', headers, body: JSON.stringify({ milliseconds: 5000 }) })
  await new Promise((resolve) => setTimeout(resolve, 100))
  let settled = false
  const awaiting = mutate('POST', '', { ...scope, previewId: fourth.previewId }).then((response) => { settled = true; return response })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.equal(settled, false, `approval should be queued behind store busy operation; diagnostic=${await (await busy).clone().text()}`)
  let blocked = false
  for (let i = 0; i < 30 && !blocked; i++) {
    try { await rename(root, swapped); await rename(swapped, root) }
    catch (e) { if (['EPERM', 'EACCES', 'EBUSY'].includes((e as NodeJS.ErrnoException).code ?? '')) blocked = true; else throw e }
    if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(blocked, `native root handle must prevent delete/rename sharing while approval is queued; approval=${await (await awaiting).clone().text()}`)
  assert.equal((await busy).status, 200)
  const fourthGrant = await awaiting
  assert.equal(fourthGrant.status, 200, await fourthGrant.clone().text())
  assert.equal((await mutate('DELETE', `/${(await fourthGrant.json() as { id: string }).id}`, {})).status, 200)
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
