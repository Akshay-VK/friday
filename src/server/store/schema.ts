import Database from 'better-sqlite3'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createBackup } from './backups.ts'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Source = { id: string; path: string; nativePath: string; host: string; exclusions: string[]; enabled: boolean; revision: number; health: 'ready' | 'offline' | 'denied' | 'disabled' }
export type Approval = { id: string; owner: string; expires: number; generation: number; path: string; nativePath: string; host: string; exclusions: string[]; identity?: string }

export const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system']
const MIGRATION_2 = 'CREATE TABLE migration_history (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)'
const MIGRATION_2_HASH = createHash('sha256').update(MIGRATION_2).digest('hex')

export function isTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEMES.includes(value as ThemePreference)
}

export type StoreWorkerInput =
  | { type: 'getTheme'; id: number }
  | { type: 'setTheme'; id: number; theme: ThemePreference }
  | { type: 'searchActions'; id: number; query: string; limit: number }
  | { type: 'diagnosticsBusy'; id: number; milliseconds: number }
  | { type: 'createBackup'; id: number; kind?: string; now?: string }
  | { type: 'listBackups'; id: number }
  | { type: 'previewRestore'; id: number; backupId: string }
  | { type: 'restore'; id: number; backupId: string; confirmation: string }
  | { type: 'dailyBackup'; id: number; now?: string }
  | { type: 'listSources'; id: number }
  | { type: 'addSource'; id: number; source: Source }
  | { type: 'registerApproval'; id: number; approval: Approval }
  | { type: 'cancelApproval'; id: number; approvalId: string; owner: string }
  | { type: 'approveSource'; id: number; approvalId: string; owner: string; source: Source; identity?: string; generation: number; leaseDeadline?: number; lease?: SharedArrayBuffer }
  | { type: 'invalidateApprovals'; id: number; paths: string[] }
  | { type: 'disableSource'; id: number; sourceId: string; revision: number }
  | { type: 'setSourceHealth'; id: number; sourceId: string; revision: number; health: Source['health'] }
  | { type: 'revokeSource'; id: number; sourceId: string }
  | { type: 'close'; id: number }

export type StoreWorkerOutput =
  | { type: 'ready' }
  | { type: 'result'; id: number; value: unknown }
  | { type: 'error'; id?: number; message: string }

export function openStore(dataHome: string) {
  const db = new Database(join(dataHome, 'friday.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 2000')
  db.pragma('foreign_keys = ON')
  migrate(db, dataHome)
  return db
}

function migrate(db: Database.Database, dataHome: string) {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version > 3) throw new Error('Store schema is newer than this Friday version; update Friday, do not downgrade the data')
  if (version < 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE action_registry (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          description TEXT NOT NULL,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          harmless INTEGER NOT NULL DEFAULT 0
        );
        CREATE VIRTUAL TABLE action_search USING fts5(
          id UNINDEXED,
          label,
          description,
          tokenize = 'porter unicode61'
        );
        PRAGMA user_version = 1;
      `)
    })()
  }
  if (version === 1) createBackup(db, dataHome, 'pre-migration')
  if (version === 1 && process.env.FRIDAY_DIAGNOSTICS === '1' && process.env.FRIDAY_TEST_MIGRATION_FAILURE === '1') throw new Error('Injected migration interruption after protected copy')
  // v1 is the known baseline; its first upgrade is protected before the schema changes.
  if ((db.pragma('user_version', { simple: true }) as number) === 1) {
    db.transaction(() => {
      db.exec(MIGRATION_2)
      db.prepare('INSERT INTO migration_history (version, checksum, applied_at) VALUES (2, ?, ?)').run(MIGRATION_2_HASH, new Date().toISOString())
      db.pragma('user_version = 2')
    })()
  }
  const applied = db.prepare('SELECT version, checksum FROM migration_history').all() as Array<{ version: number; checksum: string }>
  if (applied.length !== 1 || applied[0]?.version !== 2 || applied[0].checksum !== MIGRATION_2_HASH) throw new Error('Store migration record is incompatible; restore a verified copy or use a compatible Friday version')
  if ((db.pragma('user_version', { simple: true }) as number) === 2) {
    if (version === 2) createBackup(db, dataHome, 'pre-migration')
    db.transaction(() => {
      db.exec('CREATE TABLE sources (id TEXT PRIMARY KEY, path TEXT NOT NULL, native_path TEXT NOT NULL, host TEXT NOT NULL, exclusions TEXT NOT NULL, enabled INTEGER NOT NULL, revision INTEGER NOT NULL, health TEXT NOT NULL); PRAGMA user_version = 3;')
    })()
  }
}

export function listSources(db: Database.Database): Source[] {
  return (db.prepare('SELECT * FROM sources ORDER BY rowid').all() as Array<{ id: string; path: string; native_path: string; host: string; exclusions: string; enabled: number; revision: number; health: Source['health'] }>).map((row) => ({ id: row.id, path: row.path, nativePath: row.native_path, host: row.host, exclusions: JSON.parse(row.exclusions) as string[], enabled: row.enabled === 1, revision: row.revision, health: row.health }))
}

export function addSource(db: Database.Database, source: Source): Source {
  db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(source.id, source.path, source.nativePath, source.host, JSON.stringify(source.exclusions), source.enabled ? 1 : 0, source.revision, source.health)
  return source
}

export function disableSource(db: Database.Database, id: string, revision: number): Source {
  if (!db.prepare("UPDATE sources SET enabled=0, health='disabled', revision=revision+1 WHERE id=? AND revision=?").run(id, revision).changes) throw new Error('Source changed or was removed; refresh before disabling')
  return listSources(db).find((source) => source.id === id)!
}

export function setSourceHealth(db: Database.Database, id: string, revision: number, health: Source['health']): Source {
  db.prepare('UPDATE sources SET health=? WHERE id=? AND revision=? AND enabled=1').run(health, id, revision)
  const source = listSources(db).find((item) => item.id === id)
  if (!source) throw new Error('Source was removed')
  return source
}

export function getTheme(db: Database.Database): ThemePreference {
  const row = db
    .prepare('SELECT value FROM preferences WHERE key = ?')
    .get('theme') as { value?: string } | undefined
  return isTheme(row?.value) ? row.value : 'system'
}

export function setTheme(
  db: Database.Database,
  theme: ThemePreference,
): ThemePreference {
  db.prepare(
    `INSERT INTO preferences (key, value, revision, updated_at)
     VALUES ('theme', ?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       revision = preferences.revision + 1,
       updated_at = excluded.updated_at`,
  ).run(theme, new Date().toISOString())
  return getTheme(db)
}

export type RegisteredAction = {
  id: string
  label: string
  description: string
  method: string
  path: string
  harmless: boolean
}

export const ACTIONS: readonly RegisteredAction[] = [
  {
    id: 'friday.check-service',
    label: 'Check local service',
    description: 'Read-only health check of the Friday host',
    method: 'GET',
    path: '/api/health',
    harmless: true,
  },
  {
    id: 'friday.about',
    label: 'About Friday',
    description: 'Show the shell version, bundled licences, and what this build does not do',
    method: 'UI',
    path: 'dialog:about',
    harmless: true,
  },
]

export function seedActions(db: Database.Database) {
  db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO action_registry (id, label, description, method, path, harmless)
       VALUES (@id, @label, @description, @method, @path, @harmless)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         description = excluded.description,
         method = excluded.method,
         path = excluded.path,
         harmless = excluded.harmless`,
    )
    const insertSearch = db.prepare(
      'INSERT INTO action_search (id, label, description) VALUES (?, ?, ?)',
    )
    db.prepare('DELETE FROM action_search').run()
    for (const action of ACTIONS) {
      upsert.run({ ...action, harmless: action.harmless ? 1 : 0 })
      insertSearch.run(action.id, action.label, action.description)
    }
  })()
}

function quoteFtsQuery(query: string): string {
  const tokens = query
    .replace(/["*()^:{}[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  if (tokens.length === 0) return '""'
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(' ')
}

export function searchActions(
  db: Database.Database,
  query: string,
  limit: number,
): RegisteredAction[] {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20)
  const rows = db
    .prepare(
      `SELECT a.id, a.label, a.description, a.method, a.path, a.harmless
       FROM action_search s
       JOIN action_registry a ON a.id = s.id
       WHERE action_search MATCH ?
       ORDER BY bm25(action_search)
       LIMIT ?`,
    )
    .all(quoteFtsQuery(query), boundedLimit) as Array<
    Omit<RegisteredAction, 'harmless'> & { harmless: number }
  >
  return rows.map((row) => ({ ...row, harmless: row.harmless === 1 }))
}

/**
 * Bounded diagnostic that keeps the SQLite owner thread genuinely busy with a
 * real parameterized FTS5 statement. The HTTP service must stay responsive
 * while this runs; it is gated behind FRIDAY_DIAGNOSTICS=1.
 */
export function diagnosticsBusy(
  db: Database.Database,
  milliseconds: number,
): { milliseconds: number; iterations: number } {
  const bounded = Math.min(Math.max(Math.trunc(milliseconds), 1), 5_000)
  const statement = db.prepare(
    'SELECT count(*) AS matches FROM action_search WHERE action_search MATCH ?',
  )
  const deadline = Date.now() + bounded
  let iterations = 0
  do {
    statement.get('serv* OR health* OR local*')
    iterations += 1
  } while (Date.now() < deadline)
  return { milliseconds: bounded, iterations }
}
