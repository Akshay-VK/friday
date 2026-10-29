import { mkdirSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { parentPort, workerData } from 'node:worker_threads'
import type {
  StoreWorkerInput,
  StoreWorkerOutput,
} from './schema.ts'
import { createBackup, inspect, listBackups, retain } from './backups.ts'
import {
  diagnosticsBusy,
  getTheme,
  openStore,
  searchActions,
  seedActions,
  setTheme,
} from './schema.ts'

const { dataHome } = workerData as { dataHome: string }

function send(message: StoreWorkerOutput) {
  parentPort?.postMessage(message)
}

let db: ReturnType<typeof openStore>
let pending: { id: string; confirmation: string; revision: string; checksum: string; expires: number } | undefined
let lastFailure: string | undefined
const revision = () => createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM preferences ORDER BY key').all())).digest('hex')
try {
  mkdirSync(dataHome, { recursive: true })
  db = openStore(dataHome)
  seedActions(db)
  send({ type: 'ready' })
} catch (error) {
  send({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  })
}

parentPort?.on('message', (message: StoreWorkerInput) => {
  if (!db) return
  try {
    switch (message.type) {
      case 'getTheme':
        send({ type: 'result', id: message.id, value: getTheme(db) })
        break
      case 'setTheme':
        pending = undefined
        send({
          type: 'result',
          id: message.id,
          value: setTheme(db, message.theme),
        })
        break
      case 'createBackup': {
        const backup = createBackup(db, dataHome, message.kind ?? 'manual', message.now ? new Date(message.now) : new Date())
        lastFailure = undefined
        send({ type: 'result', id: message.id, value: backup })
        break
      }
      case 'listBackups':
        send({ type: 'result', id: message.id, value: { backups: listBackups(dataHome), lastFailure } })
        break
      case 'dailyBackup': {
        const now = message.now ? new Date(message.now) : new Date()
        const today = now.toISOString().slice(0, 10)
        const existing = listBackups(dataHome)
        if (!existing.some((item) => item.kind === 'daily' && item.createdAt.startsWith(today))) createBackup(db, dataHome, 'daily', now)
        const monday = new Date(`${today}T00:00:00Z`)
        monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
        const week = monday.toISOString().slice(0, 10)
        if (!existing.some((item) => item.kind === 'weekly' && (() => {
          const d = new Date(`${item.createdAt.slice(0, 10)}T00:00:00Z`)
          d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
          return d.toISOString().slice(0, 10) === week
        })())) createBackup(db, dataHome, 'weekly', now)
        retain(dataHome)
        lastFailure = undefined
        send({ type: 'result', id: message.id, value: true })
        break
      }
      case 'previewRestore': {
        const { manifest, rows } = inspect(dataHome, message.backupId)
        pending = { id: message.backupId, confirmation: randomUUID(), revision: revision(), checksum: manifest.checksum, expires: Date.now() + 5 * 60_000 }
        send({ type: 'result', id: message.id, value: { confirmation: pending.confirmation, currentTheme: getTheme(db), restoredTheme: rows.find((row) => row.key === 'theme')?.value ?? 'system', counts: manifest.counts, excluded: ['action_registry', 'action_search', 'friday.lock', 'WAL/SHM'], createdAt: manifest.createdAt } })
        break
      }
      case 'restore': {
        if (!pending || pending.id !== message.backupId || pending.confirmation !== message.confirmation || pending.expires < Date.now() || pending.revision !== revision()) throw new Error('Restore preview expired or state changed; preview again')
        const { manifest, rows } = inspect(dataHome, message.backupId)
        if (manifest.checksum !== pending.checksum) throw new Error('Snapshot changed; preview again')
        pending = undefined
        createBackup(db, dataHome, 'pre-restore')
        db.transaction(() => {
          db.prepare('DELETE FROM preferences').run()
          const insert = db.prepare('INSERT INTO preferences (key, value, revision, updated_at) VALUES (@key, @value, @revision, @updated_at)')
          for (const row of rows) insert.run(row)
        })()
        lastFailure = undefined
        send({ type: 'result', id: message.id, value: { theme: getTheme(db) } })
        break
      }
      case 'searchActions':
        send({
          type: 'result',
          id: message.id,
          value: searchActions(db, message.query, message.limit),
        })
        break
      case 'diagnosticsBusy':
        send({
          type: 'result',
          id: message.id,
          value: diagnosticsBusy(db, message.milliseconds),
        })
        break
      case 'close':
        db.pragma('wal_checkpoint(TRUNCATE)')
        db.close()
        parentPort?.close()
        break
      default:
        break
    }
  } catch (error) {
    if (message.type === 'createBackup' || message.type === 'dailyBackup' || message.type === 'restore') lastFailure = 'Backup or restore failed. Check free space and permissions in the Friday data home; retry after resolving the issue.'
    send({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
