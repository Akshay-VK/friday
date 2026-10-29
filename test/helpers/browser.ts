import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright-core'

export type BrowserResult =
  | { ok: true; browser: Browser; executablePath: string | undefined }
  | { ok: false; reason: string }

function playwrightCandidates(): string[] {
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) return []
  const candidates: string[] = []
  for (const entry of readdirSync(cache)) {
    if (entry.startsWith('chromium_headless_shell-')) {
      candidates.push(
        join(cache, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      )
      candidates.push(join(cache, entry, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'))
    }
    if (entry.startsWith('chromium-')) {
      candidates.push(join(cache, entry, 'chrome-linux', 'chrome'))
      candidates.push(join(cache, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
    }
  }
  return candidates.filter(existsSync)
}

function systemCandidates(): string[] {
  return [
    process.env.FRIDAY_BROWSER_EXECUTABLE,
    ...(process.platform === 'win32' ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ] : []),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter((value): value is string => Boolean(value) && existsSync(value as string))
}

/**
 * Starts a real Chromium through playwright-core. Nothing is installed: the
 * helper only uses a browser that already exists on this machine, and it
 * reports the exact obstacle when none can start.
 */
export async function launchBrowser(): Promise<BrowserResult> {
  const libs = process.env.FRIDAY_BROWSER_LIBS
  if (libs && existsSync(libs)) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${libs}:${process.env.LD_LIBRARY_PATH}`
      : libs
  }

  const candidates: Array<string | undefined> = [
    ...systemCandidates(),
    ...playwrightCandidates(),
  ]
  if (candidates.length === 0) {
    candidates.push(undefined)
  }

  let lastError = ''
  for (const executablePath of candidates) {
    try {
      const browser = await chromium.launch({
        executablePath,
        headless: true,
      })
      return { ok: true, browser, executablePath }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ok: false,
    reason: [
      'No launchable Chromium/Chrome was found on this host, so browser acceptance',
      'was not executed. Install nothing system-wide; point FRIDAY_BROWSER_EXECUTABLE',
      'at an existing browser and, if its shared libraries live outside the system',
      'search path, set FRIDAY_BROWSER_LIBS to that directory.',
      `Last launch error: ${lastError.split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown'}`,
    ].join(' '),
  }
}

export function luminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const normalised = value / 255
    return normalised <= 0.03928
      ? normalised / 12.92
      : ((normalised + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function parseColor(value: string): [number, number, number] {
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (!match?.[1]) throw new Error(`Cannot parse colour: ${value}`)
  const [r, g, b] = match[1].split(',').map((part) => Number(part.trim()))
  return [r ?? 0, g ?? 0, b ?? 0]
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = luminance(...parseColor(foreground))
  const bg = luminance(...parseColor(background))
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}
