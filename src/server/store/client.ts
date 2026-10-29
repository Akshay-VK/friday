import { Worker } from 'node:worker_threads'
import type {
  RegisteredAction,
  StoreWorkerInput,
  StoreWorkerOutput,
  ThemePreference,
} from './schema.ts'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type StoreRequest = StoreWorkerInput extends infer T
  ? T extends { id: number }
    ? Omit<T, 'id'>
    : never
  : never

export class StoreClient {
  #worker: Worker
  #pending = new Map<number, Pending>()
  #nextId = 1
  #closing = false

  constructor(dataHome: string) {
    this.#worker = new Worker(new URL('./store-worker.ts', import.meta.url), {
      workerData: { dataHome },
    })
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (message: StoreWorkerOutput) => {
        if (message.type === 'ready') {
          cleanup()
          resolve()
        } else if (message.type === 'error' && message.id === undefined) {
          cleanup()
          reject(new Error(`Store worker failed: ${message.message}`))
        }
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onExit = (code: number) => {
        cleanup()
        reject(new Error(`Store worker exited during startup (${code})`))
      }
      const cleanup = () => {
        this.#worker.off('message', onMessage)
        this.#worker.off('error', onError)
        this.#worker.off('exit', onExit)
        this.#worker.on('message', (message: StoreWorkerOutput) => this.#onMessage(message))
        this.#worker.on('error', (error: Error) => this.#rejectAll(error))
        this.#worker.on('exit', (code) => {
          if (!this.#closing) {
            this.#rejectAll(
              new Error(`Store worker exited unexpectedly (${code})`),
            )
          }
        })
      }
      this.#worker.on('message', onMessage)
      this.#worker.on('error', onError)
      this.#worker.on('exit', onExit)
    })
  }

  #onMessage(message: StoreWorkerOutput) {
    if (message.type === 'result' || message.type === 'error') {
      if (message.id === undefined) return
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      if (message.type === 'error') {
        pending.reject(new Error(message.message))
      } else {
        pending.resolve(message.value)
      }
    }
  }

  #rejectAll(error: Error) {
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  #request<T>(message: StoreRequest): Promise<T> {
    const id = this.#nextId++
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      this.#worker.postMessage({ ...message, id })
    })
  }

  getTheme(): Promise<ThemePreference> {
    return this.#request({ type: 'getTheme' })
  }

  createBackup(): Promise<{ id: string; counts: { preferences: number }; createdAt: string }> { return this.#request({ type: 'createBackup' }) }
  listBackups(): Promise<{ backups: Array<{ id: string; createdAt: string; kind: string; counts: { preferences: number } }>; lastFailure?: string }> { return this.#request({ type: 'listBackups' }) }
  previewRestore(backupId: string): Promise<{ confirmation: string; currentTheme: ThemePreference; restoredTheme: ThemePreference; counts: { preferences: number }; excluded: string[]; createdAt: string }> { return this.#request({ type: 'previewRestore', backupId }) }
  restore(backupId: string, confirmation: string): Promise<{ theme: ThemePreference }> { return this.#request({ type: 'restore', backupId, confirmation }) }
  dailyBackup(now?: string): Promise<boolean> { return this.#request({ type: 'dailyBackup', now }) }

  setTheme(theme: ThemePreference): Promise<ThemePreference> {
    return this.#request({ type: 'setTheme', theme })
  }

  searchActions(query: string, limit = 10): Promise<RegisteredAction[]> {
    return this.#request({ type: 'searchActions', query, limit })
  }

  diagnosticsBusy(milliseconds: number): Promise<{
    milliseconds: number
    iterations: number
  }> {
    return this.#request({ type: 'diagnosticsBusy', milliseconds })
  }

  async close(): Promise<void> {
    if (this.#closing) return
    this.#closing = true
    const done = new Promise<void>((resolve) => {
      this.#worker.once('exit', () => resolve())
    })
    try {
      this.#worker.postMessage({ type: 'close', id: this.#nextId++ })
      await Promise.race([
        done,
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ])
    } finally {
      await this.#worker.terminate().catch(() => undefined)
    }
  }
}
