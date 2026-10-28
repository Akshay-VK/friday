import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'

/**
 * Friday owns exactly one data home at a time. A second host process must be
 * rejected before it opens the SQLite database, otherwise two writers could
 * interleave migrations and preferences.
 *
 * The lock is a small JSON file created with O_EXCL, which is atomic on both
 * NTFS and Linux filesystems. A lock whose recorded process is gone is
 * treated as stale and reclaimed once.
 */
export const LOCK_FILE_NAME = 'friday.lock'

export class DataHomeLockedError extends Error {
  override readonly name = 'DataHomeLockedError'
  readonly code = 'FRIDAY_LOCKED'
  readonly lockPath: string
  readonly ownerPid: number | undefined

  constructor(lockPath: string, ownerPid: number | undefined) {
    const owner =
      ownerPid === undefined ? 'another process' : `process ${ownerPid}`
    super(`${lockPath} is held by ${owner} using this Friday data home`)
    this.lockPath = lockPath
    this.ownerPid = ownerPid
  }
}

export type DataHomeLock = {
  path: string
  release: () => void
}

type LockRecord = { pid?: unknown; startedAt?: unknown; platform?: unknown }

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readOwner(lockPath: string): LockRecord | undefined {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8')) as LockRecord
  } catch {
    return undefined
  }
}

function readOwnerPid(lockPath: string): number | undefined {
  const pid = readOwner(lockPath)?.pid
  return typeof pid === 'number' ? pid : undefined
}

export function acquireDataHomeLock(dataHome: string): DataHomeLock {
  mkdirSync(dataHome, { recursive: true })
  const lockPath = join(dataHome, LOCK_FILE_NAME)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx')
      try {
        writeSync(
          fd,
          JSON.stringify({
            pid: process.pid,
            platform: process.platform,
            startedAt: new Date().toISOString(),
          }),
        )
      } finally {
        closeSync(fd)
      }
      let released = false
      return {
        path: lockPath,
        release: () => {
          if (released) return
          released = true
          try {
            if (readOwnerPid(lockPath) === process.pid) unlinkSync(lockPath)
          } catch {
            // A missing lock file means there is nothing left to release.
          }
        },
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const owner = readOwner(lockPath)
      const ownerPid = readOwnerPid(lockPath)
      // Never evict an ambiguous/incomplete lock, or a lock written by a
      // different OS whose process IDs cannot be checked from this runtime.
      if (owner?.platform !== process.platform || ownerPid === undefined) {
        throw new DataHomeLockedError(lockPath, ownerPid)
      }
      if (ownerPid !== undefined && processAlive(ownerPid)) {
        throw new DataHomeLockedError(lockPath, ownerPid)
      }
      // Stale lock from a crashed process: reclaim it once.
      try {
        unlinkSync(lockPath)
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw new DataHomeLockedError(lockPath, ownerPid)
      }
    }
  }

  throw new DataHomeLockedError(lockPath, readOwnerPid(lockPath))
}
