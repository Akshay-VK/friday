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
  listSources,
  addSource,
  disableSource,
  setSourceHealth,
} from './schema.ts'

const { dataHome } = workerData as { dataHome: string }

function send(message: StoreWorkerOutput) {
  parentPort?.postMessage(message)
}

let db: ReturnType<typeof openStore>
let pending: { id: string; confirmation: string; revision: string; checksum: string; expires: number } | undefined
let lastFailure: string | undefined
const revision = () => createHash('sha256').update(JSON.stringify([db.prepare('SELECT * FROM preferences ORDER BY key').all(), db.prepare("SELECT name FROM sqlite_master WHERE name='sources'").get() ? listSources(db) : []])).digest('hex')
const approvals = new Map<string, import('./schema.ts').Approval>()
const generations = new Map<string, number>()
function invalidate(paths: string[]) {
  for (const path of paths) generations.set(path, (generations.get(path) ?? 0) + 1)
  for (const [id, approval] of approvals) if (paths.includes(approval.path) || paths.includes(approval.nativePath)) approvals.delete(id)
}
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
      case 'listSources':
        send({ type: 'result', id: message.id, value: listSources(db) })
        break
      case 'addSource':
        pending = undefined
        send({ type: 'result', id: message.id, value: addSource(db, message.source) })
        break
      case 'registerApproval': {
        const a = message.approval
        if (approvals.has(a.id) || a.expires <= Date.now()) throw new Error('Preview cancelled or source permission changed; preview again')
        approvals.set(a.id, a)
        send({ type: 'result', id: message.id, value: true })
        break
      }
      case 'cancelApproval': {
        const a = approvals.get(message.approvalId)
        if (a?.owner === message.owner) approvals.delete(message.approvalId)
        send({ type: 'result', id: message.id, value: true })
        break
      }
      case 'invalidateApprovals':
        invalidate(message.paths)
        send({ type: 'result', id: message.id, value: true })
        break
      case 'approveSource': {
        const a = approvals.get(message.approvalId)
        const s = message.source
        if (!a || a.owner !== message.owner || a.expires <= Date.now() || a.generation !== message.generation || a.identity !== message.identity ||
          (s.host === 'windows' && (!message.lease || Atomics.load(new Int32Array(message.lease), 0) !== 1 || !message.leaseDeadline || message.leaseDeadline <= Date.now() + 3_000)) ||
          JSON.stringify([a.path, a.nativePath, a.host, a.exclusions]) !== JSON.stringify([s.path, s.nativePath, s.host, s.exclusions])) throw new Error('Preview expired, cancelled or folder identity changed; preview again')
        // The worker owns both the single-use ticket and the database write.
        const value = db.transaction(() => addSource(db, s))()
        approvals.delete(a.id)
        pending = undefined
        send({ type: 'result', id: message.id, value })
        break
      }
      case 'disableSource':
        pending = undefined
        { const source = disableSource(db, message.sourceId, message.revision); invalidate([source.path, source.nativePath]); send({ type: 'result', id: message.id, value: source }) }
        break
      case 'setSourceHealth':
        send({ type: 'result', id: message.id, value: setSourceHealth(db, message.sourceId, message.revision, message.health) })
        break
      case 'revokeSource':
        pending = undefined
        { const source = listSources(db).find((item) => item.id === message.sourceId); const removed = db.prepare('DELETE FROM sources WHERE id=?').run(message.sourceId).changes > 0; if (source) invalidate([source.path, source.nativePath]); send({ type: 'result', id: message.id, value: removed }) }
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
        send({ type: 'result', id: message.id, value: { confirmation: pending.confirmation, currentTheme: getTheme(db), restoredTheme: rows.preferences.find((row) => row.key === 'theme')?.value ?? 'system', counts: manifest.counts, excluded: ['action_registry', 'action_search', 'friday.lock', 'WAL/SHM'], createdAt: manifest.createdAt } })
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
          db.prepare('DELETE FROM sources').run()
          const insert = db.prepare('INSERT INTO preferences (key, value, revision, updated_at) VALUES (@key, @value, @revision, @updated_at)')
          for (const row of rows.preferences) insert.run(row)
          for (const source of rows.sources) addSource(db, { ...source, enabled: false, health: 'disabled', revision: source.revision + 1 })
        })()
        invalidate([...new Set([...approvals.values()].flatMap((a) => [a.path, a.nativePath]))])
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
