import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrap, mutationHeaders } from './helpers/harness.ts'

const exec = promisify(execFile)
const repo = fileURLToPath(new URL('../', import.meta.url))

test('Linux syscall trace observes fixture reads and rejects attempted source writes across server descendants', { skip: process.platform !== 'linux' }, async (t) => {
  const base = await mkdtemp(join('/tmp/opencode', 'friday-traced-source-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const root = join(base, 'source')
  const home = join(base, 'state-home')
  const binary = join(base, 'trace')
  const nativeProbe = join(base, 'native-probe')
  const log = join(base, 'trace.log')
  await mkdir(root)
  await mkdir(home)
  await mkdir(join(root, '.git'))
  await mkdir(join(root, 'ignored'))
  for (const path of ['.hidden', '.git/config', 'ignored/cache', 'untracked']) await writeFile(join(root, path), 'fixture')
  await exec('cc', ['-std=c11', '-Wall', '-Wextra', '-O2', join(repo, 'test/helpers/linux-source-trace.c'), '-o', binary])
  await exec('cc', ['-std=c11', '-Wall', '-Wextra', '-O2', join(repo, 'test/helpers/linux-trace-probe.c'), '-o', nativeProbe])
  // First prove the detector catches failed create/edit/delete attempts, without modifying fixtures.
  const probe = spawn(binary, [root, join(base, 'probe.log'), process.execPath, '-e', `
    const fs = require('node:fs'); const root = process.argv[1];
    for (const name of ['.hidden', '.git/config', 'ignored/cache', 'untracked']) {
      try { fs.openSync(root + '/' + name, 'r+'); } catch {}
      try { fs.openSync(root + '/' + name, 'wx'); } catch {}
      try { fs.unlinkSync(root + '/' + name + '-missing'); } catch {}
    }
    require('node:child_process').spawnSync(process.argv[2], [root]);
  `, root, nativeProbe], { stdio: 'ignore' })
  assert.equal(await new Promise<number | null>((resolve) => probe.once('close', resolve)), 0)
  const observed = await readFile(join(base, 'probe.log'), 'utf8')
  for (const path of ['.hidden', '.git/config', 'ignored/cache', 'untracked', '.git/new']) {
    assert.ok(observed.includes(join(root, path)), `missing attempted write: ${path}\n${observed}`)
  }
  assert.match(observed, /WRITE\t\d+\t(?:openat|open)\t[^\n]*\.git\/config/)
  assert.match(observed, /WRITE\t\d+\t(?:path mutation|at mutation)\t[^\n]*\.git\/new/)
  assert.ok(new Set([...observed.matchAll(/WRITE\t(\d+)/g)].map((match) => match[1])).size > 1, 'native helper child must appear in the trace')

  const child = spawn(binary, [root, log, process.execPath, 'src/server/main.ts'], {
    cwd: repo,
    env: { ...process.env, FRIDAY_DATA_HOME: home, FRIDAY_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (data: string) => { stderr += data })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => { child.once('close', () => resolve()); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 4000).unref() })
    }
  })
  const url = await new Promise<string>((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`traced server startup timed out: ${stderr}`)), 20_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      const ready = output.match(/FRIDAY_READY (\{[^\n]+\})/)
      if (ready) { clearTimeout(timeout); resolve((JSON.parse(ready[1]!) as { url: string }).url) }
    })
    child.once('close', (code) => { clearTimeout(timeout); reject(new Error(`tracer exited ${code}: ${stderr}`)) })
  })
  const session = await bootstrap(url)
  const headers = mutationHeaders(url, session.cookie, session.body.csrfToken)
  const scope = { path: root, host: 'local', exclusions: ['.git'] }
  const post = (route: string, body: object) => fetch(`${url}/api/sources${route}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const preview = await post('/preview', scope)
  assert.equal(preview.status, 200, await preview.clone().text())
  const id = (await preview.json() as { previewId: string }).previewId
  assert.equal((await post('', { ...scope, previewId: id })).status, 200)
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => child.once('close', () => resolve()))
  const events = await readFile(log, 'utf8')
  assert.match(events, /READ\t/, 'trace must prove actual fixture access')
  for (const path of ['.hidden', 'ignored', 'untracked']) {
    assert.ok(events.includes(`READ\t`) && events.includes(join(root, path)), `source fixture entry not observed: ${path}\n${events}`)
  }
  assert.equal(events.split('\n').filter((line) => line.startsWith('WRITE\t')).join('\n'), '', `source write attempt detected:\n${events}`)
  assert.equal(await readFile(join(root, '.git/config'), 'utf8'), 'fixture')
})
