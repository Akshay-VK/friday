import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { APP_VERSION } from './config.ts'
import {
  createLocalSecurity,
  securityHeaders,
  type LocalSecurity,
} from './security.ts'
import type { StoreClient } from './store/client.ts'
import { isTheme } from './store/schema.ts'
import { registerSources } from './sources.ts'

export type FridayApp = {
  app: Hono
  security: LocalSecurity
}

export function createApp(options: {
  getPort: () => number
  dataHome: string
  store: StoreClient
  diagnostics?: boolean
  staticRoot?: string
}): FridayApp {
  const app = new Hono()
  const security = createLocalSecurity({
    getPort: options.getPort,
    secret: randomBytes(32),
  })

  app.use('*', securityHeaders())
  app.use('*', security.hostGuard)

  app.get('/api/health', (c) =>
    c.json({ status: 'ok', version: APP_VERSION }),
  )

  app.get('/api/bootstrap', async (c) => {
    const context = security.bootstrap(c.req.header('cookie'))
    if (context.setCookie) {
      c.header('Set-Cookie', context.sessionCookie)
    }
    return c.json({
      version: APP_VERSION,
      csrfToken: context.csrfToken,
      theme: await options.store.getTheme(),
    })
  })

  app.get('/api/preferences/theme', async (c) => {
    return c.json({ theme: await options.store.getTheme() })
  })

  app.get('/api/search', async (c) => {
    const query = (c.req.query('q') ?? '').trim()
    if (query.length === 0) {
      return c.json(
        { error: 'Search query is required', code: 'INVALID_QUERY' },
        400,
      )
    }
    if (query.length > 64) {
      return c.json(
        { error: 'Search query must be 64 characters or fewer', code: 'INVALID_QUERY' },
        400,
      )
    }
    return c.json({
      query,
      results: await options.store.searchActions(query, 10),
    })
  })

  app.put('/api/preferences/theme', security.mutationGuard, async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const value = (body as { value?: unknown } | null)?.value
    if (!isTheme(value)) {
      return c.json({ error: 'Theme must be light, dark, or system' }, 400)
    }
    return c.json({ theme: await options.store.setTheme(value) })
  })

  const invalidatePreviews = registerSources(app, security, options.store, options.dataHome)

  app.get('/api/backups', async (c) => c.json(await options.store.listBackups()))
  app.post('/api/backups/create', security.mutationGuard, async (c) => {
    try { return c.json(await options.store.createBackup()) }
    catch (error) { console.error('Backup failed:', error); return c.json({ error: 'Backup failed. Check free space and permissions in the Friday data home, then retry.' }, 503) }
  })
  app.post('/api/backups/restore-preview', security.mutationGuard, async (c) => {
    const body = await c.req.json().catch(() => null) as { id?: unknown } | null
    if (typeof body?.id !== 'string') return c.json({ error: 'Select a backup' }, 400)
    try { return c.json(await options.store.previewRestore(body.id)) }
    catch { return c.json({ error: 'Backup is corrupt, incompatible or missing. Current state was not changed.' }, 400) }
  })
  app.post('/api/backups/restore', security.mutationGuard, async (c) => {
    const body = await c.req.json().catch(() => null) as { id?: unknown; confirmation?: unknown } | null
    if (typeof body?.id !== 'string' || typeof body.confirmation !== 'string') return c.json({ error: 'Preview and explicitly confirm replacement first' }, 400)
    try { const result = await options.store.restore(body.id, body.confirmation); invalidatePreviews(); return c.json(result) }
    catch { return c.json({ error: 'Restore refused. Preview again; check backup integrity, free space and permissions. Current state was not replaced.' }, 400) }
  })

  if (options.diagnostics) {
    app.post('/api/diagnostics/daily-backup', security.mutationGuard, async (c) => {
      const body = await c.req.json().catch(() => null) as { now?: unknown } | null
      if (typeof body?.now !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/.test(body.now) || !Number.isFinite(Date.parse(body.now))) return c.json({ error: 'Invalid UTC time' }, 400)
      try { return c.json({ saved: await options.store.dailyBackup(body.now) }) }
      catch { return c.json({ error: 'Daily backup failed' }, 503) }
    })
    app.post(
      '/api/diagnostics/store-busy',
      security.mutationGuard,
      async (c) => {
        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          return c.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, 400)
        }
        const milliseconds = (body as { milliseconds?: unknown } | null)
          ?.milliseconds
        if (
          typeof milliseconds !== 'number' ||
          !Number.isInteger(milliseconds) ||
          milliseconds < 1 ||
          milliseconds > 5_000
        ) {
          return c.json(
            {
              error: 'milliseconds must be an integer between 1 and 5000',
              code: 'INVALID_BODY',
            },
            400,
          )
        }
        return c.json(await options.store.diagnosticsBusy(milliseconds))
      },
    )
  }

  app.all('/api/*', (c) =>
    c.json({ error: 'No such API route', code: 'NOT_FOUND' }, 404),
  )

  if (options.staticRoot) {
    const root = options.staticRoot
    const indexPath = join(root, 'index.html')
    app.use('/assets/*', serveStatic({ root }))
    app.use('/favicon.svg', serveStatic({ root }))
    app.get('*', async (c) => {
      let decoded = c.req.path
      try {
        decoded = decodeURIComponent(decoded)
      } catch {
        return c.text('Not found', 404)
      }
      if (decoded.includes('..')) return c.text('Not found', 404)
      try {
        return c.html(await readFile(indexPath, 'utf8'))
      } catch {
        return c.text('Friday UI build is missing. Run npm run build.', 503)
      }
    })
  }

  return { app, security }
}
