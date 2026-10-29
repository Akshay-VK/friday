import test from 'node:test'
import assert from 'node:assert/strict'
import { get as httpGet } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bootstrap,
  mutationHeaders,
  startHarness,
  startHarnessExpectingFailure,
} from './helpers/harness.ts'

test('starts on loopback and issues a session-bound CSRF token', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())

  assert.match(harness.url, /^http:\/\/127\.0\.0\.1:\d+$/)

  const res = await fetch(`${harness.url}/api/bootstrap`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), null)

  const cookie = res.headers.get('set-cookie') ?? ''
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Strict/i)

  const body = (await res.json()) as { csrfToken?: string }
  assert.equal(typeof body.csrfToken, 'string')
  assert.ok((body.csrfToken ?? '').length >= 32)
})

test('a saved appearance preference survives a host restart', async (t) => {
  const dataHome = await mkdtemp(join(tmpdir(), 'friday-persist-'))
  const hosts: Array<Awaited<ReturnType<typeof startHarness>>> = []
  t.after(async () => {
    for (const host of hosts.reverse()) await host.stop()
    await rm(dataHome, { recursive: true, force: true })
  })

  const first = await startHarness({ dataHome, keepDataHome: true })
  hosts.push(first)
  const session = await bootstrap(first.url)

  const saved = await fetch(`${first.url}/api/preferences/theme`, {
    method: 'PUT',
    headers: mutationHeaders(
      first.url,
      session.cookie,
      session.body.csrfToken,
    ),
    body: JSON.stringify({ value: 'dark' }),
  })
  assert.equal(saved.status, 200)
  assert.deepEqual(await saved.json(), { theme: 'dark' })

  const read = await fetch(`${first.url}/api/preferences/theme`, {
    headers: { Cookie: session.cookie },
  })
  assert.equal(read.status, 200)
  assert.deepEqual(await read.json(), { theme: 'dark' })

  await first.stop()

  const second = await startHarness({ dataHome, keepDataHome: true })
  hosts.push(second)
  const afterRestart = await fetch(`${second.url}/api/preferences/theme`, {
    headers: { Cookie: (await bootstrap(second.url)).cookie },
  })
  assert.equal(afterRestart.status, 200)
  assert.deepEqual(await afterRestart.json(), { theme: 'dark' })
})

test('searching the action index uses a parameterized FTS5 prefix query', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())

  const prefix = await fetch(`${harness.url}/api/search?q=serv`)
  assert.equal(prefix.status, 200)
  const prefixBody = (await prefix.json()) as {
    query: string
    results: Array<{ id: string; label: string; harmless: boolean }>
  }
  assert.equal(prefixBody.query, 'serv')
  assert.deepEqual(
    prefixBody.results.map((result) => result.id),
    ['friday.check-service'],
  )
  assert.equal(prefixBody.results[0]?.label, 'Check local service')
  assert.equal(prefixBody.results[0]?.harmless, true)

  const noMatch = await fetch(`${harness.url}/api/search?q=zzzznotregistered`)
  assert.equal(noMatch.status, 200)
  assert.deepEqual(await noMatch.json(), { query: 'zzzznotregistered', results: [] })

  const hostile = await fetch(
    `${harness.url}/api/search?q=${encodeURIComponent('" OR 1=1 -- *')}`,
  )
  assert.equal(hostile.status, 200)
  assert.deepEqual((await hostile.json() as { results: unknown[] }).results, [])

  const missing = await fetch(`${harness.url}/api/search`)
  assert.equal(missing.status, 400)
  assert.deepEqual(await missing.json(), {
    error: 'Search query is required',
    code: 'INVALID_QUERY',
  })

  const tooLong = await fetch(`${harness.url}/api/search?q=${'a'.repeat(65)}`)
  assert.equal(tooLong.status, 400)
})

test('a second instance is rejected instead of sharing the data home', async (t) => {
  const dataHome = await mkdtemp(join(tmpdir(), 'friday-lock-'))
  const hosts: Array<Awaited<ReturnType<typeof startHarness>>> = []
  t.after(async () => {
    for (const host of hosts.reverse()) await host.stop()
    await rm(dataHome, { recursive: true, force: true })
  })

  const first = await startHarness({ dataHome, keepDataHome: true })
  hosts.push(first)

  const session = await bootstrap(first.url)
  const saved = await fetch(`${first.url}/api/preferences/theme`, {
    method: 'PUT',
    headers: mutationHeaders(first.url, session.cookie, session.body.csrfToken),
    body: JSON.stringify({ value: 'light' }),
  })
  assert.equal(saved.status, 200)

  const conflict = await startHarnessExpectingFailure({
    dataHome,
    keepDataHome: true,
  })
  assert.notEqual(conflict.code, 0)
  assert.match(conflict.stderr, /FRIDAY_LOCKED/)
  assert.doesNotMatch(conflict.stderr, /FRIDAY_READY/)

  const stillServing = await fetch(`${first.url}/api/preferences/theme`, {
    headers: { Cookie: session.cookie },
  })
  assert.equal(stillServing.status, 200)
  assert.deepEqual(await stillServing.json(), { theme: 'light' })

  await first.stop()

  const afterRelease = await startHarness({ dataHome, keepDataHome: true })
  hosts.push(afterRelease)
  const readBack = await fetch(`${afterRelease.url}/api/preferences/theme`)
  assert.equal(readBack.status, 200)
  assert.deepEqual(await readBack.json(), { theme: 'light' })
})

test('a busy store query does not block the HTTP service', async (t) => {
  const harness = await startHarness({ env: { FRIDAY_DIAGNOSTICS: '1' } })
  t.after(() => harness.stop())
  const session = await bootstrap(harness.url)

  let busySettled = false
  const busy = fetch(`${harness.url}/api/diagnostics/store-busy`, {
    method: 'POST',
    headers: mutationHeaders(
      harness.url,
      session.cookie,
      session.body.csrfToken,
    ),
    body: JSON.stringify({ milliseconds: 1200 }),
  }).then(async (response) => {
    const body = (await response.json()) as {
      milliseconds: number
      iterations: number
    }
    busySettled = true
    return body
  })

  await new Promise((resolve) => setTimeout(resolve, 150))

  const latencies: number[] = []
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const started = performance.now()
    const health = await fetch(`${harness.url}/api/health`)
    latencies.push(performance.now() - started)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok', version: '0.1.0' })
  }

  assert.equal(
    busySettled,
    false,
    'the store query should still be running while health responds',
  )
  for (const latency of latencies) {
    assert.ok(latency < 1000, `health took ${latency.toFixed(0)}ms during store work`)
  }

  const finished = await busy
  assert.ok(finished.milliseconds >= 1000)
  assert.ok(finished.iterations > 0)

  const search = await fetch(`${harness.url}/api/search?q=health`)
  assert.equal(search.status, 200)
  const body = (await search.json()) as { results: Array<{ id: string }> }
  assert.deepEqual(
    body.results.map((result) => result.id),
    ['friday.check-service'],
  )
})

test('the store diagnostics route is disabled unless explicitly enabled', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())
  const session = await bootstrap(harness.url)
  const res = await fetch(`${harness.url}/api/diagnostics/store-busy`, {
    method: 'POST',
    headers: mutationHeaders(harness.url, session.cookie, session.body.csrfToken),
    body: JSON.stringify({ milliseconds: 10 }),
  })
  assert.equal(res.status, 404)
})

test('hostile Host, Origin, null Origin, missing CSRF and cross-site requests cannot mutate state', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())
  const session = await bootstrap(harness.url)
  const good = mutationHeaders(harness.url, session.cookie, session.body.csrfToken)
  const mutation = (headers: Record<string, string>) => fetch(`${harness.url}/api/preferences/theme`, {
    method: 'PUT', headers, body: JSON.stringify({ value: 'dark' }),
  })

  const hostAttack = await new Promise<{ status: number | undefined; cors: string | undefined }>((resolve, reject) => {
    httpGet(`${harness.url}/api/bootstrap`, { headers: { Host: 'attacker.example' } }, (response) => {
      response.resume()
      response.on('end', () => resolve({ status: response.statusCode, cors: response.headers['access-control-allow-origin'] }))
    }).on('error', reject)
  })
  assert.equal(hostAttack.status, 403)
  assert.equal(hostAttack.cors, undefined)
  for (const headers of [
    { ...good, Origin: 'https://attacker.example' },
    { ...good, Origin: 'null' },
    { ...good, Origin: `http://localhost:${new URL(harness.url).port}` },
    { ...good, Origin: '' },
    { ...good, 'X-Friday-CSRF': '' },
    { ...good, 'X-Friday-CSRF': 'incorrect' },
    { ...good, 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await mutation(headers)
    assert.equal(response.status, 403, JSON.stringify(headers))
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  }
  const options = await fetch(`${harness.url}/api/preferences/theme`, {
    method: 'OPTIONS', headers: { Origin: 'https://attacker.example' },
  })
  assert.equal(options.headers.get('access-control-allow-origin'), null)
  const read = await fetch(`${harness.url}/api/preferences/theme`)
  assert.deepEqual(await read.json(), { theme: 'system' })
  assert.equal((await mutation(good)).status, 200)
})
