import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_VERSION } from '../config.ts'
import { isTheme, listSources, type Source } from './schema.ts'

// Explicit authored-state inventory. Later slices must add authored tables/files here
// and extend both export and import; action_registry/FTS, lock and WAL are derived.
export const AUTHORED_TABLES = ['preferences', 'sources'] as const
export const AUTHORED_FILES: readonly string[] = []
const FORMAT = 1
const SCHEMA = 4
type Row = { key: string; value: string; revision: number; updated_at: string }
type Manifest = { format: number; schemaVersion: number; appVersion: string; createdAt: string; kind: string; counts: { preferences: number; sources?: number; files: number }; checksum: string; inventory: { tables: string[]; files: string[] } }

function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex') }
function rows(db: Database.Database): Row[] {
  return db.prepare('SELECT key, value, revision, updated_at FROM preferences ORDER BY key').all() as Row[]
}
function valid(rowsToCheck: Row[]) {
  if (rowsToCheck.some((row) => row.key !== 'theme' || !isTheme(row.value) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updated_at))) || rowsToCheck.length > 1) throw new Error('Snapshot contains invalid authored preferences')
}
function sync(path: string) { const fd = openSync(path, process.platform === 'win32' ? 'r+' : 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }
function syncDirectory(path: string) {
  // Windows Node does not reliably permit opening directories. File fsync and
  // same-directory rename still apply; power-loss directory durability is not promised.
  if (process.platform !== 'win32') sync(path)
}
function directory(home: string) { return join(home, 'backups') }
function safeId(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid backup ID') }

export function inspect(home: string, id: string): { manifest: Manifest; rows: { preferences: Row[]; sources: Source[] } } {
  safeId(id)
  return inspectPath(join(directory(home), id))
}

function inspectPath(path: string): { manifest: Manifest; rows: { preferences: Row[]; sources: Source[] } } {
  const files = readdirSync(path).sort()
  if (files.join(',') !== 'manifest.json,state.sqlite' || !lstatSync(path).isDirectory() || files.some((file) => !lstatSync(join(path, file)).isFile())) throw new Error('Snapshot files are missing or unexpected')
  const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as Manifest
  if (manifest.format !== FORMAT || ![2, 3, SCHEMA].includes(manifest.schemaVersion) || manifest.appVersion !== APP_VERSION || manifest.inventory?.tables?.join(',') !== (manifest.schemaVersion === 2 ? 'preferences' : AUTHORED_TABLES.join(',')) || manifest.inventory?.files?.length !== 0 || manifest.counts?.files !== 0 || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Snapshot format or schema is incompatible with this Friday version')
  const file = join(path, 'state.sqlite')
  if (hash(readFileSync(file)) !== manifest.checksum) throw new Error('Snapshot checksum mismatch')
  const snapshot = new Database(file, { readonly: true, fileMustExist: true })
  try {
    if ((snapshot.pragma('quick_check', { simple: true }) as string) !== 'ok' || (snapshot.pragma('user_version', { simple: true }) as number) !== manifest.schemaVersion) throw new Error('Snapshot database is invalid')
    const data = rows(snapshot)
    valid(data)
    const sources = manifest.schemaVersion === 2 ? [] : listSources(snapshot)
    if (data.length !== manifest.counts.preferences || sources.length !== (manifest.counts.sources ?? 0) || sources.some((s) => !s.id || !s.path || !s.nativePath || !['local', 'windows'].includes(s.host) || !Array.isArray(s.exclusions) || !Number.isSafeInteger(s.revision) || s.revision < 1)) throw new Error('Snapshot count or source configuration invalid')
    return { manifest, rows: { preferences: data, sources } }
  } finally { snapshot.close() }
}

export function createBackup(db: Database.Database, home: string, kind = 'manual', now = new Date()): Manifest & { id: string } {
  const root = directory(home)
  mkdirSync(root, { recursive: true })
  const id = randomUUID()
  const staging = join(root, `.${id}.pending`)
  const published = join(root, id)
  mkdirSync(staging)
  try {
    // This worker owns all writes; synchronous export prevents interleaving with mutations.
    const data = rows(db)
    const sourceData = (db.pragma('user_version', { simple: true }) as number) >= 3 ? listSources(db) : []
    valid(data)
    const snapshotFile = join(staging, 'state.sqlite')
    const snapshot = new Database(snapshotFile)
    try {
      snapshot.exec('CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE sources (id TEXT PRIMARY KEY, path TEXT NOT NULL, native_path TEXT NOT NULL, host TEXT NOT NULL, exclusions TEXT NOT NULL, enabled INTEGER NOT NULL, revision INTEGER NOT NULL, health TEXT NOT NULL, identity TEXT); PRAGMA user_version = 4;')
      const insert = snapshot.prepare('INSERT INTO preferences (key, value, revision, updated_at) VALUES (@key, @value, @revision, @updated_at)')
      snapshot.transaction(() => {
        for (const row of data) insert.run(row)
        const add = snapshot.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        for (const source of sourceData) add.run(source.id, source.path, source.nativePath, source.host, JSON.stringify(source.exclusions), source.enabled ? 1 : 0, source.revision, source.health, source.identity ?? null)
      })()
    } finally { snapshot.close() }
    sync(snapshotFile)
    const manifest: Manifest = { format: FORMAT, schemaVersion: SCHEMA, appVersion: APP_VERSION, createdAt: now.toISOString(), kind, counts: { preferences: data.length, sources: sourceData.length, files: 0 }, checksum: hash(readFileSync(snapshotFile)), inventory: { tables: [...AUTHORED_TABLES], files: [] } }
    writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest))
    sync(join(staging, 'manifest.json'))
    // Reopen the staged bundle and validate the same manifest/checksum/schema
    // and authored inventory checks used by preview before it is published.
    inspectPath(staging)
    syncDirectory(staging)
    if (process.env.FRIDAY_DIAGNOSTICS === '1' && process.env.FRIDAY_TEST_BACKUP_FAILURE === 'ENOSPC') throw Object.assign(new Error('Injected storage exhaustion'), { code: 'ENOSPC' })
    renameSync(staging, published)
    syncDirectory(root)
    return { ...manifest, id }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

export function listBackups(home: string): Array<Manifest & { id: string }> {
  try {
    return readdirSync(directory(home)).filter((id) => /^[a-f0-9-]{36}$/.test(id)).flatMap((id) => {
      try { return [{ ...inspect(home, id).manifest, id }] } catch { return [] }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch { return [] }
}

export function retain(home: string) {
  const daily = new Set<string>()
  const weekly = new Set<string>()
  for (const backup of listBackups(home)) {
    if (backup.kind !== 'daily' && backup.kind !== 'weekly') continue
    const day = backup.createdAt.slice(0, 10)
    // UTC week anchored on Monday; one retained weekly per week, even past seven days.
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    const week = date.toISOString().slice(0, 10)
    if (backup.kind === 'daily' && !daily.has(day) && daily.size < 7) daily.add(day)
    else if (backup.kind === 'weekly' && !weekly.has(week) && weekly.size < 4) weekly.add(week)
    else { rmSync(join(directory(home), backup.id), { recursive: true }) ; continue }
  }
}
