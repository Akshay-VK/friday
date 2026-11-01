import { startFriday } from './start.ts'
import { DataHomeLockedError } from './lock.ts'

let friday: Awaited<ReturnType<typeof startFriday>>
try {
  friday = await startFriday()
} catch (error) {
  if (error instanceof DataHomeLockedError) {
    console.error(
      `FRIDAY_LOCKED ${JSON.stringify({
        code: error.code,
        lockPath: error.lockPath,
        ownerPid: error.ownerPid ?? null,
        message: error.message,
      })}`,
    )
    process.exitCode = 3
  } else {
    console.error(
      `FRIDAY_START_FAILED ${JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
      })}`,
    )
    process.exitCode = 1
  }
  throw error
}

console.log(
  `FRIDAY_READY ${JSON.stringify({ url: friday.url, port: friday.port })}`,
)

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  try {
    await friday.close()
    if (process.connected) process.disconnect?.()
    process.exitCode = 0
  } catch (error) {
    console.error(`Friday shutdown failed after ${signal}`, error)
    process.exitCode = 1
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
// Isolated test hosts can request the same graceful shutdown across Windows,
// where child.kill('SIGTERM') terminates the process without a JS signal.
if (process.channel) {
  process.on('message', (message) => {
    if (message === 'friday:shutdown') void shutdown('IPC')
  })
}
