import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import {
  contrastRatio,
  launchBrowser,
  type BrowserResult,
} from './helpers/browser.ts'
import { startHarness, type Harness } from './helpers/harness.ts'

let browserResult: BrowserResult

before(async () => {
  browserResult = await launchBrowser()
  if (!browserResult.ok) throw new Error(browserResult.reason)
})

after(async () => {
  if (browserResult.ok) await browserResult.browser.close()
})

function requireBrowser(t: { skip: (reason: string) => void }) {
  if (!browserResult.ok) {
    t.skip(browserResult.reason)
    return null
  }
  return browserResult
}

async function openShell(
  browser: Extract<BrowserResult, { ok: true }>,
  harness: Harness,
): Promise<Page> {
  const page = await browser.browser.newPage()
  await page.goto(harness.url, { waitUntil: 'load' })
  await page.locator('h1').first().waitFor({ state: 'visible' })
  await page.locator('main#main[aria-busy="false"]').waitFor({ state: 'visible' })
  return page
}

test('the shell renders with landmarks, a local font, and no remote requests', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())

  const page = await browser.browser.newPage()
  t.after(() => page.close())
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  const response = await page.goto(harness.url, { waitUntil: 'networkidle' })
  assert.equal(response?.status(), 200)
  assert.match(
    response?.headers()['content-security-policy'] ?? '',
    /default-src 'self'/,
  )

  assert.equal(await page.title(), 'Home | Friday')
  await page.locator('h1').first().waitFor({ state: 'visible' })
  assert.match((await page.locator('h1').first().textContent()) ?? '', /Home/)
  assert.equal(await page.locator('main#main').count(), 1)
  assert.equal(await page.locator('nav[aria-label="Primary"]').count(), 1)
  assert.equal(await page.locator('a.skip-link').count(), 1)
  assert.equal(await page.getByRole('link', { name: 'Home' }).getAttribute('aria-current'), 'page')
  await page.getByRole('link', { name: 'Settings' }).click()
  assert.equal(await page.getByRole('heading', { name: 'Settings', level: 1 }).count(), 1)
  assert.equal(await page.getByRole('link', { name: 'Settings' }).getAttribute('aria-current'), 'page')
  assert.equal(await page.title(), 'Settings | Friday')
  assert.equal(await page.getByRole('link', { name: 'Projects' }).count(), 0)

  const remote = requests.filter(
    (url) => !url.startsWith(harness.url) && !url.startsWith('data:'),
  )
  assert.deepEqual(remote, [], 'the shell must not fetch remote assets')

  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.ready
    return document.fonts.check('16px "Roboto Flex"')
  })
  assert.equal(fontLoaded, true, 'the bundled Roboto Flex face should load locally')

  assert.equal(
    await page.locator('[style]').count(),
    0,
    'the page policy forbids inline style attributes',
  )
})

test('backup controls restore appearance through explicit preview and confirmation', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const host = await startHarness()
  t.after(() => host.stop())
  const page = await openShell(browser, host)
  t.after(() => page.close())
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.getByRole('button', { name: 'Back up now' }).click()
  await page.getByText('Backup saved', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'System', exact: true }).click()
  await page.locator('li').filter({ hasText: 'manual' }).getByRole('button', { name: 'Preview restore' }).click()
  await page.getByRole('dialog', { name: 'Confirm restore' }).getByText('Replace system with dark', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Replace authored state' }).click()
  await page.locator('button[aria-pressed="true"]').filter({ hasText: 'Dark' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'), 'true')
})

test('restore rejection keeps the current preference and the named dialog open for retry', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const host = await startHarness()
  t.after(() => host.stop())
  const page = await openShell(browser, host)
  t.after(() => page.close())
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.getByRole('button', { name: 'Back up now' }).click()
  await page.getByText('Backup saved', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'System', exact: true }).click()
  await page.locator('li').filter({ hasText: 'manual' }).getByRole('button', { name: 'Preview restore' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm restore' })
  await dialog.waitFor()
  await page.route('**/api/backups/restore', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Pre-restore copy failed' }) }))
  await dialog.getByRole('button', { name: 'Replace authored state' }).click()
  await dialog.getByRole('alert').getByText('Pre-restore copy failed', { exact: false }).waitFor()
  assert.equal(await dialog.isVisible(), true)
  assert.equal(await page.getByRole('button', { name: 'System', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('li').filter({ hasText: 'manual' }).getByRole('button', { name: 'Preview restore' }).evaluate(el => el === document.activeElement), true)
})

test('narrow navigation has full labels and preserves the selected route and focus', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const host = await startHarness()
  t.after(() => host.stop())
  const page = await browser.browser.newPage({ viewport: { width: 390, height: 844 } })
  t.after(() => page.close())
  await page.goto(host.url)
  await page.locator('main[aria-busy="false"]').waitFor()
  await page.getByRole('button', { name: 'Menu' }).click()
  const nav = page.getByRole('dialog', { name: 'Friday navigation' })
  await nav.getByRole('link', { name: 'Settings' }).click()
  assert.equal(await page.getByRole('heading', { name: 'Settings', level: 1 }).evaluate(el => el === document.activeElement), true)
  await page.getByRole('button', { name: 'Menu' }).click()
  assert.equal(await nav.getByRole('link', { name: 'Settings' }).getAttribute('aria-current'), 'page')
  await page.keyboard.press('Escape')
  await nav.waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: 'Menu' }).evaluate(el => el === document.activeElement), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
})

test('bootstrap failure offers a retry without claiming project state', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const host = await startHarness()
  t.after(() => host.stop())
  const page = await browser.browser.newPage()
  t.after(() => page.close())
  await page.route('**/api/bootstrap', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable' }) }))
  await page.goto(host.url)
  await page.getByRole('heading', { name: 'Friday could not connect to its local service' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Try again' }).isVisible(), true)
  assert.equal(await page.getByText('Nothing to resume yet').count(), 0)
})

test('Home and recovery actions reflow without page-wide scrolling at laptop and zoomed widths', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const host = await startHarness()
  t.after(() => host.stop())
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [640, 720], [390, 844]] as const) {
    const page = await browser.browser.newPage({ viewport: { width, height } })
    try {
      await page.goto(host.url)
      await page.locator('main[aria-busy="false"]').waitFor()
      const primary = page.getByRole('button', { name: 'View settings' })
      assert.equal(await primary.isVisible(), true, `${width}: return action`)
      if (width === 1280) assert.equal((await primary.boundingBox())!.y < height, true, 'return action above fold')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: Home overflow`)
      if (width < 760) {
        await page.getByRole('button', { name: 'Menu' }).click()
        await page.getByRole('dialog', { name: 'Friday navigation' }).getByRole('link', { name: 'Settings' }).click()
      } else await page.getByRole('link', { name: 'Settings' }).click()
      assert.equal(await page.getByRole('button', { name: 'Back up now' }).isVisible(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: Settings overflow`)
    } finally { await page.close() }
  }
})

test('keyboard focus is visible and the skip link is first', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())
  const page = await openShell(browser, harness)
  t.after(() => page.close())

  await page.evaluate(() => document.body.focus())
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    return {
      text: element?.textContent?.trim() ?? '',
      outlineStyle: element ? getComputedStyle(element).outlineStyle : '',
      outlineWidth: element ? getComputedStyle(element).outlineWidth : '',
    }
  })
  assert.match(focused.text, /Skip to main content/)
  assert.equal(focused.outlineStyle, 'solid')
  assert.notEqual(focused.outlineWidth, '0px')
})

test('appearance choice is saved through the API and survives a host restart', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const dataHome = await mkdtemp(join(tmpdir(), 'friday-browser-theme-'))
  const hosts: Harness[] = []
  t.after(async () => {
    for (const host of hosts.reverse()) await host.stop()
    await rm(dataHome, { recursive: true, force: true })
  })

  const first = await startHarness({ dataHome, keepDataHome: true })
  hosts.push(first)
  const page = await openShell(browser, first)
  t.after(() => page.close())

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark',
  )
  assert.equal(
    await page.evaluate(
      () => document.documentElement.dataset.themePreference,
    ),
    'dark',
  )
  assert.equal(
    await page
      .getByRole('button', { name: 'Dark', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  )

  const stored = await fetch(`${first.url}/api/preferences/theme`)
  assert.deepEqual(await stored.json(), { theme: 'dark' })

  await first.stop()

  const second = await startHarness({ dataHome, keepDataHome: true })
  hosts.push(second)
  const reopened = await openShell(browser, second)
  t.after(() => reopened.close())
  await reopened.getByRole('link', { name: 'Settings' }).click()

  await reopened.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark',
  )
  assert.equal(
    await reopened
      .getByRole('button', { name: 'Dark', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  )
  assert.deepEqual(
    await (await fetch(`${second.url}/api/preferences/theme`)).json(),
    { theme: 'dark' },
  )
})

test('system appearance follows the OS preference until a fixed choice is made', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())
  const page = await openShell(browser, harness)
  t.after(() => page.close())

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('button', { name: 'System', exact: true }).click()
  await page.waitForFunction(
    () => document.documentElement.dataset.themePreference === 'system',
  )
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    'light',
  )

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark',
  )
})

test('Ctrl+K opens the palette, filters through the local index, and Escape restores focus', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())
  const page = await openShell(browser, harness)
  t.after(() => page.close())

  const trigger = page.getByRole('button', { name: /Search/ }).first()
  await trigger.focus()
  await page.keyboard.press('Control+k')

  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.isVisible(), true)

  const options = page.getByRole('option')
  await page.waitForFunction(
    () => document.querySelectorAll('[role="option"]').length >= 2,
  )
  const labels = await options.allTextContents()
  assert.ok(labels.some((label) => label.includes('Check local service')))
  assert.ok(labels.some((label) => label.includes('About Friday')))

  const input = page.getByRole('combobox', { name: 'Search commands' })
  await input.fill('about')
  await page.waitForFunction(() => {
    const rendered = [...document.querySelectorAll('[role="option"]')]
    return (
      rendered.length === 1 &&
      (rendered[0]?.textContent ?? '').includes('About Friday')
    )
  })

  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.match(
    (await page.evaluate(() => document.activeElement?.textContent ?? '')) ?? '',
    /Search/,
  )
})

test('the palette and a visible button invoke the same registered action', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())
  const page = await openShell(browser, harness)
  t.after(() => page.close())

  await page.getByRole('link', { name: 'Settings' }).click()
  const visible = page.getByRole('button', { name: 'Check local service' }).first()
  await visible.click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some((element) =>
      (element.textContent ?? '').includes('Local service answered: ok'),
    ),
  )

  await page.getByRole('button', { name: /Search commands/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await dialog.waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => document.querySelectorAll('[role="option"]').length >= 2,
  )
  await page.keyboard.press('Enter')

  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some((element) =>
      (element.textContent ?? '').includes('Local service answered: ok'),
    ),
  )
  assert.equal(await dialog.isVisible(), false)

  await page.getByRole('button', { name: /About Friday/ }).first().click()
  const about = page.getByRole('dialog', { name: /Friday v/ })
  await about.waitFor({ state: 'visible' })
  assert.match((await about.textContent()) ?? '', /Roboto Flex/)
  await about.getByRole('button', { name: 'Close' }).click()
  await about.waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: /About Friday/ }).first().evaluate(el => el === document.activeElement), true)
})

test('reduced motion removes spatial transitions', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())
  const page = await openShell(browser, harness)
  t.after(() => page.close())

  const readMotion = () =>
    page.evaluate(() => {
      const button = document.querySelector('.button--primary')
      return button ? getComputedStyle(button).transitionDuration : 'missing'
    })

  assert.notEqual(await readMotion(), '0s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await readMotion(), '0s')
})

test('semantic roles keep readable contrast in both palettes', async (t) => {
  const browser = requireBrowser(t)
  if (!browser) return
  const harness = await startHarness()
  t.after(() => harness.stop())
  const page = await openShell(browser, harness)
  t.after(() => page.close())

  // Colour transitions would otherwise be sampled mid-interpolation.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() =>
    getComputedStyle(document.querySelector('.button--primary') as Element)
      .transitionDuration === '0s',
  )

  for (const preference of ['Light', 'Dark'] as const) {
    if (preference === 'Light') await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByRole('button', { name: preference, exact: true }).click()
    await page.waitForFunction(
      (wanted) =>
        document.documentElement.dataset.themePreference === wanted.toLowerCase(),
      preference,
    )
    const colours = await page.evaluate(() => {
      const body = getComputedStyle(document.body)
      const primary = document.querySelector('.button--primary')
      const primaryStyle = primary ? getComputedStyle(primary) : null
      const meta = document.querySelector('.settings-section p')
      return {
        surface: body.backgroundColor,
        text: body.color,
        primaryBackground: primaryStyle?.backgroundColor ?? '',
        primaryText: primaryStyle?.color ?? '',
        metaText: meta ? getComputedStyle(meta).color : '',
      }
    })
    assert.ok(
      contrastRatio(colours.text, colours.surface) >= 4.5,
      `${preference}: body text contrast`,
    )
    assert.ok(
      contrastRatio(colours.primaryText, colours.primaryBackground) >= 4.5,
      `${preference}: primary button contrast`,
    )
    assert.ok(
      contrastRatio(colours.metaText, colours.surface) >= 4.5,
      `${preference}: supporting text contrast`,
    )
  }
})
