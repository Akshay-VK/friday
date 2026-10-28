import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Harness = {
  url: string
  dataHome: string
  process: ReturnType<typeof spawn>
  stop: () => Promise<void>
}

const root = fileURLToPath(new URL('../../', import.meta.url))

export async function startHarness(options: {
  dataHome?: string
  keepDataHome?: boolean
  env?: Record<string, string>
} = {}): Promise<Harness> {
  const dataHome =
    options.dataHome ?? (await mkdtemp(join(tmpdir(), 'friday-test-')))
  const child = spawn(process.execPath, ['src/server/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      FRIDAY_DATA_HOME: dataHome,
      FRIDAY_PORT: '0',
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })

  let stderr = ''
  child.stderr!.setEncoding('utf8')
  child.stderr!.on('data', (chunk) => {
    stderr += chunk
  })

  const url = await new Promise<string>((resolve, reject) => {
    let stdout = ''
    const timeout = setTimeout(
      () => reject(new Error(`server did not start\n${stderr}`)),
      15_000,
    )
    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk) => {
      stdout += chunk
      for (const line of stdout.split(/\r?\n/)) {
        if (line.startsWith('FRIDAY_READY ')) {
          clearTimeout(timeout)
          resolve(JSON.parse(line.slice('FRIDAY_READY '.length)).url)
        }
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`server exited before ready (${code})\n${stderr}`))
    })
  })

  const stop = async () => {
    if (child.exitCode === null) {
      if (child.connected) child.send('friday:shutdown')
      else child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => child.kill('SIGKILL'), 3_000)
        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
    if (!options.keepDataHome) {
      await rm(dataHome, { recursive: true, force: true })
    }
  }

  return { url, dataHome, process: child, stop }
}

export async function bootstrap(baseUrl: string) {  const res = await fetch(`${baseUrl}/api/bootstrap`)
  const body = (await res.json()) as { csrfToken: string }
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { res, body, cookie }
}

export function mutationHeaders(
  origin: string,
  cookie: string,
  csrfToken: string,
) {
  return {
    Origin: origin,
    Cookie: cookie,
    'X-Friday-CSRF': csrfToken,
    'Content-Type': 'application/json',
  }
}

export async function startHarnessExpectingFailure(options: {
  dataHome: string
  keepDataHome?: boolean
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['src/server/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      FRIDAY_DATA_HOME: options.dataHome,
      FRIDAY_PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`server did not exit\nstdout: ${stdout}\nstderr: ${stderr}`))
    }, 15_000)
    child.once('exit', (exitCode) => {
      clearTimeout(timeout)
      resolve(exitCode)
    })
  })

  return { code, stdout, stderr }
}
