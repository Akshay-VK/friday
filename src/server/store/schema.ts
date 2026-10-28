import Database from 'better-sqlite3'
import { join } from 'node:path'

export type ThemePreference = 'light' | 'dark' | 'system'

export const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system']

export function isTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEMES.includes(value as ThemePreference)
}

export type StoreWorkerInput =
  | { type: 'getTheme'; id: number }
  | { type: 'setTheme'; id: number; theme: ThemePreference }
  | { type: 'searchActions'; id: number; query: string; limit: number }
  | { type: 'diagnosticsBusy'; id: number; milliseconds: number }
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
  migrate(db)
  return db
}

function migrate(db: Database.Database) {
  const version = db.pragma('user_version', { simple: true }) as number
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
