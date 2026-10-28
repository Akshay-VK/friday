import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/**
 * Friday-owned SVG icons drawn for this shell (no icon font, no remote asset).
 * Each icon is decorative; the control always exposes a text label.
 */
function createIcon(paths: React.ReactNode) {
  return function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const HomeIcon = createIcon(
  <>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6.5 9.5V19h11V9.5" />
  </>,
)

export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="5.5" />
    <path d="m15.5 15.5 4 4" />
  </>,
)

export const SunIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </>,
)

export const MoonIcon = createIcon(
  <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
)

export const SystemIcon = createIcon(
  <>
    <rect x="3.5" y="5" width="17" height="11" rx="2" />
    <path d="M9 19h6" />
  </>,
)

export const ServiceIcon = createIcon(
  <>
    <path d="M5 12h3l2-4 3 8 2-4h4" />
  </>,
)

export const DatabaseIcon = createIcon(
  <>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </>,
)

export const LockIcon = createIcon(
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </>,
)

export const PaletteIcon = createIcon(
  <>
    <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
    <path d="M7 10.5h4M7 13.5h7" />
  </>,
)

export const InfoIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 11v5M12 8.2v.1" />
  </>,
)

export const CloseIcon = createIcon(
  <path d="m7 7 10 10M17 7 7 17" />,
)

export const ArrowIcon = createIcon(
  <>
    <path d="M5 12h13" />
    <path d="m13 7 5 5-5 5" />
  </>,
)
