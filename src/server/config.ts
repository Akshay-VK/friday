import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export const APP_VERSION = '0.1.0'

export function defaultDataHome(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'Friday')
  }
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    'friday',
  )
}

export function resolveDataHome(value: string | undefined): string {
  const path = resolve(value ?? defaultDataHome())
  if (!isAbsolute(path)) {
    throw new Error('Friday data home must be an absolute path')
  }
  return path
}

export function resolvePort(value: string | undefined): number {
  const port = Number(value ?? '4317')
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('FRIDAY_PORT must be an integer between 0 and 65535')
  }
  return port
}
