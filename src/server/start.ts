import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { resolveDataHome, resolvePort } from './config.ts'
import { acquireDataHomeLock } from './lock.ts'
import { StoreClient } from './store/client.ts'

export async function startFriday(options?: {
  dataHome?: string
  port?: number
}) {
  const dataHome = resolveDataHome(
    options?.dataHome ?? process.env.FRIDAY_DATA_HOME,
  )
  const port = resolvePort(
    options?.port === undefined ? process.env.FRIDAY_PORT : String(options.port),
  )
  let boundPort = port

  const lock = acquireDataHomeLock(dataHome)

  const store = new StoreClient(dataHome)
  try {
    await store.start()
  } catch (error) {
    await store.close()
    lock.release()
    throw error
  }

  const { app } = createApp({
    getPort: () => boundPort,
    dataHome,
    store,
    diagnostics: process.env.FRIDAY_DIAGNOSTICS === '1',
    staticRoot: fileURLToPath(new URL('../../dist/', import.meta.url)),
  })

  const server = serve(
    {
      fetch: app.fetch,
      hostname: '127.0.0.1',
      port,
    },
    (info) => {
      boundPort = info.port
    },
  )

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
  } catch (error) {
    await store.close()
    lock.release()
    throw error
  }

  // Catch up once after downtime and check UTC day rollover while the host is active.
  const backupClock = () => process.env.FRIDAY_DIAGNOSTICS === '1' ? process.env.FRIDAY_TEST_NOW : undefined
  const checkBackup = () => void store.dailyBackup(backupClock()).catch((error: unknown) => console.error('Daily backup failed; check Friday data home free space and permissions:', error))
  checkBackup()
  const dailyTimer = setInterval(checkBackup, 60_000)

  return {
    url: `http://127.0.0.1:${boundPort}`,
    port: boundPort,
    dataHome,
    close: async () => {
      clearInterval(dailyTimer)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await store.close()
      lock.release()
    },
  }
}
