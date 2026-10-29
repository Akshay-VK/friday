import test from 'node:test'
import assert from 'node:assert/strict'
import { startHarness } from './helpers/harness.ts'

async function html(url: string) {
  const res = await fetch(`${url}/`)
  return { res, body: await res.text() }
}

test('the built shell is served from loopback with a restrictive policy', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())

  const { res, body } = await html(harness.url)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  const csp = res.headers.get('content-security-policy') ?? ''
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /script-src 'self'/)
  assert.match(csp, /connect-src 'self'/)
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/)
  assert.equal(res.headers.get('access-control-allow-origin'), null)

  assert.match(body, /<html lang="en"/)
  assert.match(body, /<div id="root">/)
  assert.doesNotMatch(body, /https?:\/\//, 'the shell must not reference remote assets')
  assert.doesNotMatch(body, /<script[^>]*>[^<]/i, 'no inline script is allowed by policy')
})

test('referenced client assets are local and every asset responds', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())

  const { body } = await html(harness.url)
  const references = [...body.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(
    (match) => match[1] as string,
  )
  assert.ok(references.length >= 2, 'expected script and stylesheet references')

  for (const reference of references) {
    const res = await fetch(`${harness.url}${reference}`)
    assert.equal(res.status, 200, `${reference} should be served`)
    if (reference.endsWith('.css')) {
      const css = await res.text()
      assert.doesNotMatch(css, /url\(\s*['"]?(?:https?:)?\/\//, 'no remote CSS assets')
      assert.match(css, /@font-face/)
    }
  }
})

test('unknown browser routes fall back to the shell but traversal does not', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.stop())

  const fallback = await fetch(`${harness.url}/projects`)
  assert.equal(fallback.status, 200)
  assert.match(await fallback.text(), /<div id="root">/)

  const traversal = await fetch(`${harness.url}/..%2fpackage.json`)
  assert.equal(traversal.status, 404)

  const missingApi = await fetch(`${harness.url}/api/does-not-exist`)
  assert.equal(missingApi.status, 404)
  assert.match(missingApi.headers.get('content-type') ?? '', /application\/json/)
})
