import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

const SESSION_COOKIE = 'friday_session'

export type SecurityContext = {
  csrfToken: string
  sessionCookie: string
  setCookie: boolean
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

function validSession(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value))
}

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
    )
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Cross-Origin-Resource-Policy', 'same-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    await next()
  }
}

export function createLocalSecurity(options: {
  getPort: () => number
  secret: Buffer
}) {
  const csrfFor = (session: string) =>
    createHmac('sha256', options.secret)
      .update(`friday-csrf:${session}`)
      .digest('base64url')

  const hostAllowed = (host: string | undefined) => {
    if (!host) return false
    const port = options.getPort()
    return (
      host === `127.0.0.1:${port}` ||
      host === `localhost:${port}` ||
      host === `[::1]:${port}`
    )
  }

  const originAllowed = (origin: string | undefined, host: string | undefined) =>
    Boolean(origin && hostAllowed(host) && origin === `http://${host}`)

  const readSession = (cookieHeader: string | undefined) => {
    const value = readCookie(cookieHeader, SESSION_COOKIE)
    return validSession(value) ? value : undefined
  }

  const bootstrap = (cookieHeader: string | undefined): SecurityContext => {
    const existing = readSession(cookieHeader)
    const session = existing ?? randomBytes(32).toString('base64url')
    return {
      csrfToken: csrfFor(session),
      sessionCookie: `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict`,
      setCookie: !existing,
    }
  }

  const hostGuard: MiddlewareHandler = async (c, next) => {
    if (!hostAllowed(c.req.header('host'))) {
      return c.json({ error: 'Host not allowed' }, 403)
    }
    await next()
  }

  const mutationGuard: MiddlewareHandler = async (c, next) => {
    if (!originAllowed(c.req.header('origin'), c.req.header('host'))) {
      return c.json({ error: 'Origin not allowed' }, 403)
    }
    const fetchSite = c.req.header('sec-fetch-site')
    if (fetchSite && fetchSite !== 'same-origin') {
      return c.json({ error: 'Cross-site request rejected' }, 403)
    }
    const session = readSession(c.req.header('cookie'))
    const supplied = c.req.header('x-friday-csrf')
    if (!session || !supplied) {
      return c.json({ error: 'CSRF authorization required' }, 403)
    }
    const expected = Buffer.from(csrfFor(session))
    const actual = Buffer.from(supplied)
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return c.json({ error: 'CSRF authorization invalid' }, 403)
    }
    if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
      return c.json({ error: 'JSON content type required' }, 415)
    }
    await next()
  }

  return { bootstrap, hostGuard, mutationGuard, originAllowed }
}

export type LocalSecurity = ReturnType<typeof createLocalSecurity>
