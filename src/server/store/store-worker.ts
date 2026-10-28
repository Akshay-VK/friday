import { mkdirSync } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
import type {
  StoreWorkerInput,
  StoreWorkerOutput,
} from './schema.ts'
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
        send({
          type: 'result',
          id: message.id,
          value: setTheme(db, message.theme),
        })
        break
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
    send({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
