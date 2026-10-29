import type { ThemePreference } from './api.ts'

export type ResolvedTheme = 'light' | 'dark'

export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  description: string
}> = [
  { value: 'light', label: 'Light', description: 'Always use the light palette' },
  { value: 'dark', label: 'Dark', description: 'Always use the dark palette' },
  {
    value: 'system',
    label: 'System',
    description: 'Follow the operating system appearance',
  },
]

const darkQuery = '(prefers-color-scheme: dark)'

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia(darkQuery).matches
  )
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark = systemPrefersDark(),
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Applies the resolved palette through data attributes so the stylesheet — not
 * an inline style attribute — owns every colour. The page policy forbids
 * inline styles, and this keeps theme state inspectable for tests.
 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePreference = preference
  return resolved
}

export function watchSystemTheme(
  listener: (prefersDark: boolean) => void,
): () => void {
  const query = window.matchMedia(darkQuery)
  const handler = (event: MediaQueryListEvent) => listener(event.matches)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
