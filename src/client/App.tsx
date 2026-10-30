import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getBootstrap, getHealth, rememberCsrfToken, saveTheme, createBackup, listBackups, previewRestore, restoreBackup, type Backup, type RestorePreview, type ThemePreference } from './api.ts'
import { HomeIcon, InfoIcon, SearchIcon, ServiceIcon, SunIcon, MoonIcon, SystemIcon, PaletteIcon } from './icons.tsx'
import { CommandPalette } from './Palette.tsx'
import { createActionRegistry, type ActionContext } from './registry.ts'
import { applyTheme, resolveTheme, systemPrefersDark, THEME_OPTIONS, watchSystemTheme } from './theme.ts'

type Route = 'home' | 'settings'
const THEME_ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon }

export function App() {
  const registry = useMemo(() => createActionRegistry(), [])
  const actions = useMemo(() => registry.list(), [registry])
  const [route, setRoute] = useState<Route>(location.pathname === '/settings' ? 'settings' : 'home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [loadError, setLoadError] = useState('')
  const [version, setVersion] = useState('0.1.0')
  const [theme, setTheme] = useState<ThemePreference>('system')
  const themeRef = useRef<ThemePreference>('system')
  const [health, setHealth] = useState<{ checkedAt?: string; version?: string; error?: string }>({})
  const [announcement, setAnnouncement] = useState('')
  const [backups, setBackups] = useState<Backup[]>([])
  const [backupMessage, setBackupMessage] = useState('')
  const [backupsStale, setBackupsStale] = useState(false)
  const [restorePlan, setRestorePlan] = useState<{ id: string; preview: RestorePreview } | null>(null)
  const [restoreError, setRestoreError] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const paletteInvoker = useRef<HTMLElement | null>(null)
  const aboutInvoker = useRef<HTMLElement | null>(null)
  const restoreInvoker = useRef<HTMLElement | null>(null)
  const menuInvoker = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDialogElement>(null)
  const restoreRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const navigate = useCallback((next: Route) => {
    history.pushState(null, '', next === 'home' ? '/' : '/settings')
    setRoute(next)
    setMenuOpen(false)
    document.title = `${next === 'home' ? 'Home' : 'Settings'} | Friday`
    setAnnouncement(`${next === 'home' ? 'Home' : 'Settings'} view`)
    requestAnimationFrame(() => headingRef.current?.focus())
  }, [])
  useEffect(() => {
    document.title = `${route === 'home' ? 'Home' : 'Settings'} | Friday`
    const pop = () => { const next = location.pathname === '/settings' ? 'settings' : 'home'; setRoute(next); document.title = `${next === 'home' ? 'Home' : 'Settings'} | Friday`; requestAnimationFrame(() => headingRef.current?.focus()) }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [route])
  const refreshBackups = useCallback(async () => {
    try {
      const state = await listBackups()
      setBackups(state.backups)
      setBackupsStale(false)
      if (state.lastFailure) setBackupMessage(`Backup failed: ${state.lastFailure}`)
    } catch { setBackupsStale(true); setBackupMessage('Could not check backups. Check the Friday data home and retry.') }
  }, [])
  const refreshHealth = useCallback(async () => {
    try {
      const response = await getHealth()
      setHealth({ version: response.version, checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
    } catch (error) { setHealth(previous => ({ ...previous, error: error instanceof Error ? error.message : String(error) })) }
  }, [])
  const chooseTheme = useCallback(async (next: ThemePreference) => {
    const previous = themeRef.current
    themeRef.current = next; setTheme(next); applyTheme(next)
    try {
      const saved = await saveTheme(next)
      themeRef.current = saved.theme; setTheme(saved.theme); applyTheme(saved.theme)
      setAnnouncement(`Appearance saved: ${saved.theme}`)
      return true
    } catch (error) {
      themeRef.current = previous; setTheme(previous); applyTheme(previous)
      setAnnouncement(`Appearance was not saved: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }, [])
  const actionContext: ActionContext = useMemo(() => ({ setTheme: chooseTheme, requestAbout: () => { aboutInvoker.current = paletteOpen ? paletteInvoker.current : document.activeElement as HTMLElement; setAboutOpen(true) } }), [chooseTheme, paletteOpen])
  const runAction = useCallback(async (id: string) => {
    setPaletteOpen(false)
    const outcome = await registry.invoke(id, actionContext)
    setAnnouncement(outcome.message)
    if (id === 'friday.check-service') void refreshHealth()
  }, [registry, actionContext, refreshHealth])
  const openPalette = useCallback(() => { paletteInvoker.current = document.activeElement as HTMLElement; setPaletteOpen(true) }, [])
  useEffect(() => { if (!paletteOpen && paletteInvoker.current?.isConnected) paletteInvoker.current.focus() }, [paletteOpen])
  useEffect(() => { if (!aboutOpen && aboutInvoker.current?.isConnected) aboutInvoker.current.focus() }, [aboutOpen])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !restorePlan && !aboutOpen) { event.preventDefault(); openPalette() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [openPalette, restorePlan, aboutOpen])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await getBootstrap()
        if (cancelled) return
        rememberCsrfToken(payload.csrfToken); setVersion(payload.version)
        themeRef.current = payload.theme; setTheme(payload.theme); applyTheme(payload.theme)
        setPhase('ready'); void refreshBackups(); void refreshHealth()
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof ApiError ? `${error.message} (status ${error.status})` : error instanceof Error ? error.message : String(error))
        setPhase('failed')
      }
    })()
    return () => { cancelled = true }
  }, [refreshBackups, refreshHealth])
  useEffect(() => watchSystemTheme(() => { if (themeRef.current === 'system') applyTheme('system') }), [])
  useEffect(() => {
    const dialog = menuRef.current
    if (!dialog) return
    if (menuOpen && !dialog.open) dialog.showModal()
    if (!menuOpen && dialog.open) { dialog.close(); if (menuInvoker.current?.isConnected) menuInvoker.current.focus() }
  }, [menuOpen])
  useEffect(() => {
    const dialog = restoreRef.current
    if (!dialog) return
    if (restorePlan && !dialog.open) dialog.showModal()
    if (!restorePlan && dialog.open) { dialog.close(); if (restoreInvoker.current?.isConnected) restoreInvoker.current.focus() }
  }, [restorePlan])
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = window.setInterval(() => { void refreshBackups() }, 30_000)
    return () => window.clearInterval(timer)
  }, [phase, refreshBackups])
  const backupNow = async () => {
    setBackupBusy(true)
    try { await createBackup(); await refreshBackups(); setBackupMessage('Backup saved in Friday’s data home.') }
    catch (error) { setBackupMessage(`Backup failed: ${error instanceof Error ? error.message : String(error)}`) }
    finally { setBackupBusy(false) }
  }
  const preview = async (id: string) => {
    restoreInvoker.current = document.activeElement as HTMLElement
    setBackupBusy(true); setRestoreError('')
    try { setRestorePlan({ id, preview: await previewRestore(id) }) }
    catch (error) { setBackupMessage(`Restore preview refused: ${error instanceof Error ? error.message : String(error)}`) }
    finally { setBackupBusy(false) }
  }
  const replace = async () => {
    if (!restorePlan) return
    setBackupBusy(true); setRestoreError('')
    try {
      const { theme: restored } = await restoreBackup(restorePlan.id, restorePlan.preview.confirmation)
      themeRef.current = restored; setTheme(restored); applyTheme(restored)
      setRestorePlan(null); await refreshBackups()
      setBackupMessage('Authored state restored. A pre-restore backup was saved.')
    } catch (error) { setRestoreError(`Restore refused: ${error instanceof Error ? error.message : String(error)}. Check the Friday data home and retry or cancel.`) }
    finally { setBackupBusy(false) }
  }
  const nav = (where: Route) => <a href={where === 'home' ? '/' : '/settings'} className="rail__item" aria-current={route === where ? 'page' : undefined} title={where === 'home' ? 'Home' : 'Settings'} onClick={event => { event.preventDefault(); navigate(where) }}>{where === 'home' ? <HomeIcon /> : <PaletteIcon />}<span className="rail__label">{where === 'home' ? 'Home' : 'Settings'}</span></a>
  return <div className="shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <aside className="rail">
      <div className="rail__brand"><span className="rail__mark" aria-hidden="true">F</span><span className="rail__name">Friday<span className="rail__tagline">local control room</span></span></div>
      <nav aria-label="Primary"><ul className="rail__list"><li>{nav('home')}</li><li>{nav('settings')}</li></ul></nav>
      <div className="rail__foot"><button type="button" className="rail__item rail__item--button" title="About Friday" onClick={() => void runAction('friday.about')}><InfoIcon /><span className="rail__label">About Friday</span></button></div>
    </aside>
    <div className="column"><header className="topbar"><button type="button" className="menu-button button button--tonal" aria-haspopup="dialog" onClick={() => { menuInvoker.current = document.activeElement as HTMLElement; setMenuOpen(true) }}>Menu</button><span className="topbar__context">Friday</span><button type="button" className="palette-trigger" onClick={openPalette} aria-keyshortcuts="Control+K Meta+K" aria-haspopup="dialog"><SearchIcon /><span>Search commands</span><kbd className="kbd">Ctrl K</kbd></button></header>
      <main id="main" tabIndex={-1} aria-busy={phase === 'loading'}>
        {phase === 'failed' ? <section className="panel panel--error" role="alert"><h1 className="headline" ref={headingRef} tabIndex={-1}>Friday could not connect to its local service</h1><p>Nothing was changed. Check that the server is running on this machine.</p><p>{loadError}</p><button type="button" className="button button--primary" onClick={() => location.reload()}>Try again</button></section> : phase === 'loading' ? <section className="panel" role="status"><h1 className="headline">Friday</h1><p>Connecting to the local service…</p></section> : route === 'home' ? <>
          <h1 className="headline route-title" ref={headingRef} tabIndex={-1}>Home</h1>
          {backupMessage.startsWith('Backup failed') && <section className="attention" aria-label="Attention"><h2>Backup needs attention</h2><p>{backupMessage}</p><button type="button" className="button button--quiet" onClick={() => navigate('settings')}>Open recovery settings</button></section>}
          <section className="return-surface" aria-labelledby="return-title"><div className="return-surface__body"><h2 id="return-title" className="display">Nothing to resume yet</h2><p>No project source is connected to this build. Friday can check its local service and keep your appearance and recovery preferences; source setup is not available yet.</p><div className="hero__actions"><button type="button" className="button button--primary" onClick={() => navigate('settings')}>View settings</button><button type="button" className="button button--tonal" onClick={openPalette}>Search commands</button></div></div><div className="return-surface__seam"><ServiceIcon /><span>{health.error ? 'Service check failed' : health.checkedAt ? `Service responded at ${health.checkedAt}` : 'Checking local service…'}</span></div></section>
          <section className="home-capabilities" aria-labelledby="capabilities"><h2 id="capabilities" className="title-large">What Friday can do now</h2><p>Check the local service, find registered commands, save appearance, and back up or restore authored preferences.</p><button type="button" className="button button--quiet" onClick={() => navigate('settings')}>Manage appearance and recovery</button></section>
        </> : <>
          <h1 className="headline route-title" ref={headingRef} tabIndex={-1}>Settings</h1>
          <section className="settings-section" aria-labelledby="appearance"><h2 id="appearance" className="title-large">Appearance</h2><p>{theme === 'system' ? `Following system (${resolveTheme(theme)})` : `${theme === 'light' ? 'Light' : 'Dark'} palette`} is selected. Saved in Friday’s data home.</p><div className="theme" role="group" aria-label="Appearance">{THEME_OPTIONS.map(option => { const Icon = THEME_ICONS[option.value]; return <button key={option.value} type="button" className="theme__option" aria-pressed={theme === option.value} disabled={phase !== 'ready'} title={option.description} onClick={() => void chooseTheme(option.value)}><Icon size={18}/><span>{option.label}</span></button> })}</div></section>
          <section className="settings-section" aria-labelledby="sources"><h2 id="sources" className="title-large">Sources</h2><p>Source setup is not available in this build. Friday does not scan project folders here.</p></section>
          <section className="settings-section" aria-labelledby="service"><h2 id="service" className="title-large">Local service</h2><p role="status">{health.error ? `Check failed: ${health.error}${health.checkedAt ? `. Last responded at ${health.checkedAt}.` : ''}` : health.checkedAt ? `Responded at ${health.checkedAt}, version ${health.version}.` : 'Checking the local service…'}</p><button type="button" className="button button--quiet" onClick={() => void runAction('friday.check-service')}>Check local service</button></section>
          <section className="settings-section" aria-labelledby="recovery"><h2 id="recovery" className="title-large">Recovery</h2><p>Copies include authored preferences, currently appearance. Same-disk copies do not protect against device loss.</p><button type="button" className="button button--primary" disabled={backupBusy} onClick={() => void backupNow()}>Back up now</button><p role="status" className={backupMessage.includes('failed') || backupsStale ? 'error-text' : ''}>{backupMessage || (backups.length ? 'Latest known copies below.' : 'No backup yet.')}{backupsStale ? ' Showing last known copies.' : ''}</p>{backupsStale && <button type="button" className="button button--quiet" onClick={() => void refreshBackups()}>Retry backup list</button>}<ul className="backup-list">{backups.map(backup => <li key={backup.id}><span>{backup.kind} backup, {new Date(backup.createdAt).toLocaleString()} — {backup.counts.preferences} preference(s)</span><button type="button" className="button button--quiet" disabled={backupBusy} onClick={() => void preview(backup.id)}>Preview restore</button></li>)}</ul></section>
        </>}
      </main><footer className="footer"><p>Friday v{version} · Your state stays in Friday's own data home.</p><button type="button" className="footer__link" onClick={() => void runAction('friday.about')}>About &amp; licences</button></footer></div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <dialog ref={menuRef} className="nav-dialog" aria-label="Friday navigation" onCancel={event => { event.preventDefault(); setMenuOpen(false) }}><div className="nav-dialog__head"><strong>Friday</strong><button type="button" className="button button--quiet" onClick={() => setMenuOpen(false)}>Close menu</button></div><nav aria-label="Mobile primary"><ul><li>{nav('home')}</li><li>{nav('settings')}</li></ul></nav></dialog>
    <dialog ref={restoreRef} className="about restore-dialog" aria-labelledby="restore-title" onCancel={event => { event.preventDefault(); if (!backupBusy) setRestorePlan(null) }}>{restorePlan && <><h2 id="restore-title" className="title-large">Confirm restore</h2><p>Backup from {new Date(restorePlan.preview.createdAt).toLocaleString()}. Replace {restorePlan.preview.currentTheme} with {restorePlan.preview.restoredTheme}?</p><p>Included: {restorePlan.preview.counts.preferences} authored preference(s). Excluded: {restorePlan.preview.excluded.join(', ') || 'none'}. A pre-restore copy of current state is required before replacement.</p>{restoreError && <p role="alert" className="error-text">{restoreError}</p>}<div className="dialog-actions"><button type="button" className="button button--quiet" disabled={backupBusy} onClick={() => setRestorePlan(null)}>Cancel restore</button><button type="button" className="button button--primary" disabled={backupBusy} onClick={() => void replace()}>{restoreError ? 'Retry restore' : 'Replace authored state'}</button></div></>}</dialog>
    <CommandPalette open={paletteOpen} actions={actions} onClose={() => setPaletteOpen(false)} onInvoke={id => void runAction(id)} />
    <AboutDialog open={aboutOpen} version={version} onClose={() => setAboutOpen(false)} />
  </div>
}

function AboutDialog({
  open,
  version,
  onClose,
}: {
  open: boolean
  version: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="about"
      aria-labelledby="about-title"
      onCancel={(event) => {
        event.preventDefault()
        ref.current?.close()
        onClose()
      }}
      onClose={onClose}
    >
      <div className="about__head">
        <p className="eyebrow">About</p>
        <h2 id="about-title" className="title-large">
          Friday v{version}
        </h2>
      </div>
      <p className="body">
        A local, read-only control room for your laptop. This slice is a
        foundation: loopback-only HTTP, a single-owner SQLite store with FTS5,
        one restart-persistent appearance preference, and one command palette.
      </p>
      <dl className="about__meta">
        <div>
          <dt>Typeface</dt>
          <dd>Roboto Flex, bundled locally, SIL Open Font License 1.1</dd>
        </div>
        <div>
          <dt>Icons</dt>
          <dd>Friday-owned SVG — no icon font, no CDN, no remote asset</dd>
        </div>
        <div>
          <dt>Not in this build</dt>
          <dd>
            Source scanning, credentials, network integrations, OpenCode
            service, Telegram, and Run execution
          </dd>
        </div>
      </dl>
      <button type="button" className="button button--primary" onClick={() => { ref.current?.close(); onClose() }}>
        Close
      </button>
    </dialog>
  )
}

export function shouldUseDark(preference: ThemePreference): boolean {
  return resolveTheme(preference, systemPrefersDark()) === 'dark'
}
