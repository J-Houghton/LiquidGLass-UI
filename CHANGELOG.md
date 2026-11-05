# Changelog

## 2.0.0 (2026-11-05)

First headless release. The engine is unchanged in what it computes (every map is pinned by
fixtures from before the refactor); how you use it is new.

### Breaking

- **Package shape.** ESM only. Entries: `.` (headless API), `./core` (pure engine), `./elements`
  (custom elements). The CJS build and the `lit` peer dependency are gone. `sideEffects: false`.
- **No elements are registered on import.** Call `defineLiquidGlassElements()` from
  `liquid-glass-filter/elements` on the client.
- **Parameter names.** `scalePx` → `displacementScale`, `blurStdDev` → `blur`, `showSpecular` →
  `specular`, `frost` → `tint`, `chromaticBezelFactor` → `chromaticBezelFraction` (= 1/factor).
  `glassThickness` is literal px; 1.x applied a smoothstep curve (1.x `50` ≡ 2.0 `31.25`).
  `fromLegacyParams()` maps 1.x values. The elements still accept the 1.x attribute names.
- **Validation rules relaxed.** A bezel may be wider than the corner radius; `convex_circle` is
  allowed on rectangles. Values are clamped rather than rejected; see `params.notes`.
- **Element property `blurAmount`** stands in for the `blur` parameter (`HTMLElement.blur()` exists).
- The `displacement-updated` event is replaced by `handle.debug` / `onRender` / the
  `liquid-glass:render` element event.

### Added

- `attachLiquidGlass(target, options)`: ResizeObserver sizing, computed border-radius, optional
  style application with `getStyle()` for frameworks.
- `createGlassFilter(host, options)`: filter-only handle with `url`, `update`, `destroy`, `ready`,
  `setDpr`, `debug`.
- `/core`: `resolveGlassParams`, `displacementCurve`, `displacementMap`, `specularMap`,
  `buildFilterSpec`, `filterSpecToSvg`, plain `RGBAImage` buffers. No DOM anywhere.
- `<liquid-glass-container>` and `<liquid-glass-filter>` as hand-rolled custom elements with
  typed properties, attribute aliases, a `debug` overlay and a `liquid-glass:render` event.
- Injectable seams (`encodeImage`, `revokeImage`, `resizeObserver`, `document`, `dpr`) so the DOM
  layer is testable without a browser.

### Fixed

- Multiple glass instances no longer share one map cache; each handle owns and revokes its own
  blob URLs. (1.x instances revoked each other's images on every update.)
- Updates are coalesced and ordered; overlapping async rebuilds can no longer apply out of order.
- Noise blur rendered its first frame at 5× the strength of every later frame.
- Device pixel ratio changes regenerate the maps.
- `types` is the first `exports` condition, so TypeScript resolves the declarations.
- The native `canvas` package is no longer a dependency (it was only used by a test baseline).
- The hidden `<svg>` is 0×0 instead of the full effect size.

### Removed

- Lit, the Lit components, the DOM-bound filter stage builders, the global cache, `filterRes`,
  `xlink:href` dual-sets, dead duplicate files.

### Internal

- 145 tests: fixture and invariant tests for the optics, spec snapshots, scheduler and
  lifecycle tests (fake DOM for the DOM layer, happy-dom for the elements). CI runs typecheck,
  tests and the build on Node 22.
- `src/core` is typechecked with no DOM lib to keep it pure.

## 1.0.0

Lit-based `<liquid-glass-container>` / `<liquid-glass-filter>` with the same optics.
