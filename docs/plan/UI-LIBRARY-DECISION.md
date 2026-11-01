# R0 UI primitive decision (#56)

Friday follows the [UX specification](UX-SPEC.md) for Material 3 Expressive shape, typography, tonal roles, adaptive layout, and reduced motion. This is a Friday implementation of that direction, **not** a complete or official Material 3 Expressive web implementation.

The [M3E component repository](https://github.com/matraic/m3e), [official Material Web maintenance discussion](https://github.com/material-components/material-web/discussions/5642), [native React alternative](https://github.com/minop1205/m3-expressive-react), and [Beer CSS repository](https://github.com/beercss/beercss) were evaluated against React 19, Vite 8, NodeNext typecheck, strict local CSP, offline assets, and keyboard/dialog behavior. Versions and licenses are from their npm package metadata.

| Candidate | Version / license | R0 decision |
| --- | --- | --- |
| `@m3e/react` + `@m3e/web` | 2.10.3 / MIT | Best Expressive-specific candidate, but a real button-subpath spike failed Friday's existing `tsc --noEmit`: `Module '"@m3e/react/button"' has no exported member 'M3eButton'`. Published declarations re-export `./Button` without a NodeNext extension. The pair was uninstalled; no dependency or bundled asset remains. Do not relax project-wide module resolution for one button. |
| `m3-expressive-react` | 1.6.0 / MIT | Native React option, but young/single-maintainer and no verified benefit over the two native R0 navigation and recovery controls; defer until a component-rich slice warrants a tested adoption. |
| `@material/web` | 2.5.0 / Apache-2.0 | Official M3 baseline, not Expressive: maintainers do not plan Expressive features. |
| Beer CSS | 5.0.3 / MIT | Material-styled CSS, not React interaction primitives; broad global styles would duplicate Friday's local roles. |

**Shipped primitives:** native `<button>`, `<dialog>`, and `<nav>` with existing locally licensed Roboto Flex and Friday SVG icons, semantic light/dark CSS roles, focus return, and no remote fonts or scripts. Browser/public-HTTP checks verify Friday's CSP, keyboard, contrast samples, and offline asset requests; they do not certify WCAG 2.2 AA or the library authors' claims. Revisit an M3E package when multiple real components reuse it and it passes Friday's typecheck, CSP, React events, focus, reduced-motion, and reflow gates.
