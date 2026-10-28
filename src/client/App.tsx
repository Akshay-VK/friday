import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ApiError,
  getBootstrap,
  getHealth,
  rememberCsrfToken,
  saveTheme,
  searchActions,
  type ActionSummary,
  type ThemePreference,
} from './api.ts'
import {
  InfoIcon,
  DatabaseIcon,
  HomeIcon,
  LockIcon,
  MoonIcon,
  PaletteIcon,
  SearchIcon,
  ServiceIcon,
  SunIcon,
  SystemIcon,
} from './icons.tsx'
import { CommandPalette } from './Palette.tsx'
import { createActionRegistry, type ActionContext } from './registry.ts'
import {
  applyTheme,
  resolveTheme,
  systemPrefersDark,
  THEME_OPTIONS,
  watchSystemTheme,
} from './theme.ts'

type Phase = 'loading' | 'ready' | 'failed'

type HealthState =
  | { state: 'checking' }
  | { state: 'ok'; version: string; checkedAt: string }
  | { state: 'error'; message: string }

const PLANNED_DESTINATIONS = [
  'Projects',
  'Sessions',
  'Files',
  'Docs',
  'Tasks',
] as const

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemIcon,
} as const

export function App() {
  const registry = useMemo(() => createActionRegistry(), [])
  const actions = useMemo(() => registry.list(), [registry])

  const [phase, setPhase] = useState<Phase>('loading')
  const [loadError, setLoadError] = useState('')
  const [version, setVersion] = useState('0.1.0')
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [health, setHealth] = useState<HealthState>({ state: 'checking' })
  const [announcement, setAnnouncement] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ActionSummary[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'done' | 'failed'>('idle')

  const themeRef = useRef<ThemePreference>('system')
  const paletteInvoker = useRef<HTMLElement | null>(null)

  const refreshHealth = useCallback(async () => {
    setHealth({ state: 'checking' })
    try {
      const payload = await getHealth()
      setHealth({
        state: 'ok',
        version: payload.version,
        checkedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      })
    } catch (error) {
      setHealth({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  const chooseTheme = useCallback(async (next: ThemePreference) => {
    const previous = themeRef.current
    themeRef.current = next
    setTheme(next)
    applyTheme(next)
    try {
      const saved = await saveTheme(next)
      themeRef.current = saved.theme
      setTheme(saved.theme)
      applyTheme(saved.theme)
      setAnnouncement(`Appearance saved: ${saved.theme}`)
      return true
    } catch (error) {
      themeRef.current = previous
      setTheme(previous)
      applyTheme(previous)
      setAnnouncement(
        `Appearance was not saved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return false
    }
  }, [])

  const actionContext: ActionContext = useMemo(
    () => ({
      setTheme: chooseTheme,
      requestAbout: () => setAboutOpen(true),
    }),
    [chooseTheme],
  )

  const runAction = useCallback(
    async (actionId: string) => {
      setPaletteOpen(false)
      const outcome = await registry.invoke(actionId, actionContext)
      setAnnouncement(outcome.message)
      if (actionId === 'friday.check-service') void refreshHealth()
    },
    [actionContext, refreshHealth, registry],
  )

  const openPalette = useCallback(() => {
    paletteInvoker.current = document.activeElement as HTMLElement | null
    setPaletteOpen(true)
  }, [])

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await getBootstrap()
        if (cancelled) return
        rememberCsrfToken(payload.csrfToken)
        setVersion(payload.version)
        themeRef.current = payload.theme
        setTheme(payload.theme)
        applyTheme(payload.theme)
        setPhase('ready')
        await refreshHealth()
      } catch (error) {
        if (cancelled) return
        setLoadError(
          error instanceof ApiError
            ? `${error.message} (status ${error.status})`
            : error instanceof Error
              ? error.message
              : String(error),
        )
        setPhase('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshHealth])

  useEffect(() => {
    return watchSystemTheme(() => {
      if (themeRef.current === 'system') applyTheme('system')
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!paletteOpen) paletteInvoker.current?.focus?.()
  }, [paletteOpen])

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length === 0) {
      setSearchResults([])
      setSearchState('idle')
      return
    }
    let cancelled = false
    setSearchState('searching')
    const timer = setTimeout(() => {
      void searchActions(trimmed)
        .then((payload) => {
          if (cancelled) return
          setSearchResults(payload.results)
          setSearchState('done')
        })
        .catch(() => {
          if (cancelled) return
          setSearchResults([])
          setSearchState('failed')
        })
    }, 140)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  const resolved = resolveTheme(theme)
  const healthLabel =
    health.state === 'ok'
      ? `Responded at ${health.checkedAt} · version ${health.version}`
      : health.state === 'error'
        ? `Not reachable: ${health.message}`
        : 'Checking the loopback service…'

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <aside className="rail">
        <div className="rail__brand">
          <span className="rail__mark" aria-hidden="true">
            F
          </span>
          <span className="rail__name">
            Friday
            <span className="rail__tagline">local control room</span>
          </span>
        </div>

        <nav aria-label="Primary">
          <ul className="rail__list">
            <li>
              <a
                className="rail__item rail__item--current"
                href="#main"
                aria-current="page"
              >
                <HomeIcon />
                <span className="rail__label">Home</span>
              </a>
            </li>
          </ul>

          <p className="rail__group-label" id="rail-planned">
            Later slices
          </p>
          <ul className="rail__list" aria-labelledby="rail-planned">
            {PLANNED_DESTINATIONS.map((destination) => (
              <li key={destination}>
                <span
                  className="rail__item rail__item--planned"
                  aria-disabled="true"
                >
                  <span className="rail__dot" aria-hidden="true" />
                  <span className="rail__label">{destination}</span>
                  <span className="rail__badge">planned</span>
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="rail__foot">
          <button
            type="button"
            className="rail__item rail__item--button"
            title="About Friday"
            onClick={() => void runAction('friday.about')}
          >
            <InfoIcon />
            <span className="rail__label">About Friday</span>
          </button>
          <p className="rail__version">v{version} · loopback only</p>
        </div>
      </aside>

      <div className="column">
        <header className="topbar">
          <p className="topbar__context">
            <span className="topbar__pulse" aria-hidden="true" />
            Local shell
          </p>
          <div className="topbar__tools">
            <button
              type="button"
              className="palette-trigger"
              onClick={openPalette}
              aria-keyshortcuts="Control+K Meta+K"
              aria-haspopup="dialog"
            >
              <SearchIcon />
              <span>Search</span>
              <kbd className="kbd">Ctrl K</kbd>
            </button>

            <div className="theme" role="group" aria-label="Appearance">
              {THEME_OPTIONS.map((option) => {
                const Icon = THEME_ICONS[option.value]
                const selected = theme === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="theme__option"
                    aria-pressed={selected}
                    disabled={phase !== 'ready'}
                    title={option.description}
                    onClick={() => void chooseTheme(option.value)}
                  >
                    <Icon size={18} />
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} aria-busy={phase === 'loading'}>
          {phase === 'failed' ? (
            <section className="panel panel--error" role="alert">
              <h1 className="headline">Friday could not start</h1>
              <p className="body">
                The local service did not answer with a session. Nothing was
                changed. Check that the server is still running on this machine.
              </p>
              <p className="mono">{loadError}</p>
              <button
                type="button"
                className="button button--primary"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </section>
          ) : (
            <>
              <section className="hero" aria-labelledby="hero-title">
                <div className="hero__text">
                  <p className="eyebrow">Slice 01 · local shell</p>
                  <h1 id="hero-title" className="display">
                    Your laptop,
                    <br />
                    quietly observed.
                  </h1>
                  <p className="hero__lede">
                    Friday keeps its own state outside your projects. This build
                    proves the foundation: a loopback-only service, one database
                    owner, and a preference that survives a restart.
                  </p>
                  <div className="hero__actions">
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => void runAction('friday.check-service')}
                      disabled={phase !== 'ready'}
                    >
                      <ServiceIcon />
                      Check local service
                    </button>
                    <button
                      type="button"
                      className="button button--tonal"
                      onClick={openPalette}
                      disabled={phase !== 'ready'}
                    >
                      <PaletteIcon />
                      Open command palette
                      <kbd className="kbd">Ctrl K</kbd>
                    </button>
                  </div>
                  <p className="hero__footnote">
                    Nothing here scans a folder, reads a credential, opens a
                    program, or runs a work command.
                  </p>
                </div>
                <div className="hero__motif" aria-hidden="true">
                  <span className="hero__ring hero__ring--outer" />
                  <span className="hero__ring hero__ring--mid" />
                  <span className="hero__ring hero__ring--inner" />
                </div>
              </section>

              <section className="ledger" aria-labelledby="ledger-title">
                <div className="section-head">
                  <h2 id="ledger-title" className="title-large">
                    Runtime
                  </h2>
                  <p className="section-head__note">
                    Observed from this process, not a promise about project data.
                  </p>
                </div>
                <dl className="ledger__list">
                  <div className="ledger__row">
                    <dt>
                      <ServiceIcon />
                      Service
                    </dt>
                    <dd>
                      <span className="ledger__value">
                        127.0.0.1 · loopback only
                      </span>
                      <span className="ledger__meta">{healthLabel}</span>
                    </dd>
                    <dd className="ledger__control">
                      <button
                        type="button"
                        className="button button--quiet"
                        onClick={() => void runAction('friday.check-service')}
                      >
                        Re-check
                      </button>
                    </dd>
                  </div>

                  <div className="ledger__row">
                    <dt>
                      <DatabaseIcon />
                      Store
                    </dt>
                    <dd>
                      <span className="ledger__value">
                        SQLite with FTS5, owned by one worker thread
                      </span>
                      <span className="ledger__meta">
                        Prefix search runs in the owner, so HTTP stays responsive.
                      </span>
                    </dd>
                    <dd className="ledger__control">
                      <span className="badge badge--calm">Owned</span>
                    </dd>
                  </div>

                  <div className="ledger__row">
                    <dt>
                      <LockIcon />
                      Instance
                    </dt>
                    <dd>
                      <span className="ledger__value">
                        One Friday per data home
                      </span>
                      <span className="ledger__meta">
                        A second instance is refused before the database opens.
                      </span>
                    </dd>
                    <dd className="ledger__control">
                      <span className="badge badge--calm">Guarded</span>
                    </dd>
                  </div>

                  <div className="ledger__row">
                    <dt>
                      <SunIcon />
                      Appearance
                    </dt>
                    <dd>
                      <span className="ledger__value">
                        {theme === 'system'
                          ? `System · currently ${resolved}`
                          : `${theme === 'light' ? 'Light' : 'Dark'} palette`}
                      </span>
                      <span className="ledger__meta">
                        Saved through the public API and restored at startup.
                      </span>
                    </dd>
                    <dd className="ledger__control">
                      <span className="badge">{theme}</span>
                    </dd>
                  </div>

                  <div className="ledger__row">
                    <dt>
                      <InfoIcon />
                      Sources
                    </dt>
                    <dd>
                      <span className="ledger__value">None configured</span>
                      <span className="ledger__meta">
                        No scan root, network integration, credential, or work
                        command is enabled in this slice.
                      </span>
                    </dd>
                    <dd className="ledger__control">
                      <span className="badge badge--muted">Empty by design</span>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="actions" aria-labelledby="actions-title">
                <div className="section-head">
                  <h2 id="actions-title" className="title-large">
                    Registered actions
                  </h2>
                  <p className="section-head__note">
                    The same registry feeds this list, the palette, and the
                    visible buttons.
                  </p>
                </div>

                <div className="search">
                  <label className="search__label" htmlFor="action-search">
                    Search the local action index
                  </label>
                  <div className="search__field">
                    <SearchIcon />
                    <input
                      id="action-search"
                      type="search"
                      placeholder="Try “serv”, “about”, or a prefix"
                      autoComplete="off"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <p className="search__status" role="status">
                    {searchQuery.trim().length === 0
                      ? `${actions.length} registered actions in the local FTS5 index`
                      : searchState === 'searching'
                        ? 'Searching the local index…'
                        : searchState === 'failed'
                          ? 'The local index did not answer.'
                          : `${searchResults.length} ${searchResults.length === 1 ? 'match' : 'matches'} for “${searchQuery.trim()}”`}
                  </p>

                  {searchQuery.trim().length > 0 && searchResults.length > 0 ? (
                    <ul className="search__results">
                      {searchResults.map((result) => (
                        <li key={result.id}>
                          <button
                            type="button"
                            className="search__result"
                            onClick={() => void runAction(result.id)}
                          >
                            <span className="search__result-label">
                              {result.label}
                            </span>
                            <span className="search__result-description">
                              {result.description}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </main>

        <footer className="footer">
          <p>
            Friday v{version} · Your state stays in Friday's own data home.
          </p>
          <button
            type="button"
            className="footer__link"
            onClick={() => void runAction('friday.about')}
          >
            About &amp; licences
          </button>
        </footer>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <CommandPalette
        open={paletteOpen}
        actions={actions}
        onClose={closePalette}
        onInvoke={(actionId) => void runAction(actionId)}
      />

      <AboutDialog
        open={aboutOpen}
        version={version}
        onClose={() => setAboutOpen(false)}
      />
    </div>
  )
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
      <button type="button" className="button button--primary" onClick={onClose}>
        Close
      </button>
    </dialog>
  )
}

export function shouldUseDark(preference: ThemePreference): boolean {
  return resolveTheme(preference, systemPrefersDark()) === 'dark'
}
