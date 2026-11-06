# Changelog

## 2.0.0 (2026-11-05, unreleased)

First headless release. How you use the engine is new; what it computes changed in a few deliberate,
fixture-pinned ways listed under "Rendering changes".

### Breaking

- **Package shape.** ESM only. Entries: `.` (headless API), `./core` (pure engine), `./elements`
  (custom elements). The CJS build and the `lit` peer dependency are gone. `sideEffects: false`.
- **No elements are registered on import.** Call `defineLiquidGlassElements()` from
  `liquid-glass-filter/elements` on the client.
- **Parameter names.** `scalePx` → `displacementScale`, `blurStdDev` → `blur`, `showSpecular` →
  `specular`, `frost` → `tint`. `glassThickness` is literal px; 1.x applied a smoothstep curve
  (1.x `50` ≡ 2.0 `31.25`). `fromLegacyParams()` maps 1.x values. The elements still accept the 1.x
  attribute names.
- **`chromaticBezelFactor` is gone.** Dispersion is three displacement passes at staggered scales and
  needs no edge mask.
- **`specularStrength` is applied once** (1.x applied it twice). Default `0.9` → `0.81`; a 1.x value
  `s` maps to `s · min(1, s)`.
- **Validation rules relaxed.** A bezel may be wider than the corner radius; `convex_circle` is
  allowed on rectangles. Values are clamped rather than rejected; see `params.notes`.
- **Element property `blurAmount`** stands in for the `blur` parameter (`HTMLElement.blur()` exists).
- The `displacement-updated` event is replaced by `handle.debug` / `onRender` / the
  `liquid-glass:render` element event.

### Added

- `attachLiquidGlass(target, options)`: support detection with a CSS frost fallback (`fallback`,
  `support`, `frostBlurPx`; `handle.mode`, `data-liquid-glass` on the target), ResizeObserver sizing,
  computed border-radius, `reducedTransparency` (`'auto'` follows `prefers-reduced-transparency`),
  optional style application with `getStyle()` for frameworks.
- `createGlassFilter(host, options)`: filter-only handle with `url`, `update`, `destroy`, `ready`,
  `setDpr`, `debug`, `regionPadding`, `rimPx`, `physicalScale` support.
- `detectGlassSupport()` / `isLiquidGlassSupported()`: engine check plus parse check (Chromium-only
  by construction, documented).
- `MapRegistry`: reference-counted sharing of identical maps across handles; concurrent encodes of the
  same map are deduplicated.
- `/core`: `resolveGlassParams`, `displacementCurve`, `displacementMap` (with `rim` baked into the
  blue channel), `specularMap`, `rimCoefficient`, `buildFilterSpec`, `filterSpecToSvg`, plain
  `RGBAImage` buffers. No DOM anywhere.
- `physicalScale` parameter: use the optics' own maximum displacement instead of `displacementScale`.
- `blurStage` parameter: `'after'` (default) blurs the refracted result, `'before'` blurs the backdrop
  first (alpha pinned to 1) and then displaces it.
- Entrance animation: `appear` option, `handle.appear(ms)`, `handle.setIntensity(k)` / `intensity`
  (a 0..1 multiplier on displacement and rim, attribute-only); `appear` attribute and `replayAppear()`
  on `<liquid-glass-container>`. Honours `prefers-reduced-motion`.
- Playground: an A/B twin that mirrors the active glass with overrides (blur stage, shade), captions,
  and a "Replay appear" control.
- `shade` parameter (0..1, default 0): edge darkening from the lens's normalized stretch profile,
  baked below 128 in the map's blue channel and multiplied in by the filter. Demo presets use 0.35.
- `maxMapPixels` option (default 320 000): pixel budget per map; `debug.mapDpr` reports the ratio.
- `sizeBucket` option (default 1.02): map sizes round up to a geometric grid (exact below 64 px) and
  the filter stretches them to the box, so a resize burst hits the map registry; `debug.mapWidth`,
  `debug.mapHeight`. Rim-band pixels shift by up to 2 % versus exact maps; `sizeBucket: 1` restores them.
- `dispersionUnit` parameter: `'relative'` (default, unchanged) or `'px'` for a fixed-width fringe.
- `MapRegistry` keeps up to `maxIdle` released maps warm (page registry: 16); `clearIdle()`.
- `detectGlassSupport()` also requires `backdrop-filter: url()` to parse and honours
  `<html data-liquid-glass-support="force|off">`.
- `demo/visual.html` screenshot harness, `scripts/visual-shot.mjs` (headless Chrome/Edge) and
  `scripts/png-diff.mjs` (PNG compare + diff image), all dependency-free.
- `scripts/check-dist.mjs` post-build guard; declarations come from `tsc` (vite-plugin-dts dropped).
- `<liquid-glass-container>` and `<liquid-glass-filter>` as hand-rolled custom elements with
  typed properties, attribute aliases, a `debug` overlay and a `liquid-glass:render` event.
- Injectable seams (`encodeImage`, `revokeImage`, `registry`, `resizeObserver`, `matchMedia`,
  `document`, `dpr`, `support`) so the DOM layer is testable without a browser.

### Rendering changes (fixture-pinned, intentional)

- The band is sampled at pixel centers: corner sectors and straight edges agree on distance and the
  map is an exact mirror image across both axes (1.x had a one-pixel offset on the right and bottom
  sides and a bright one-pixel ring at the rim).
- The rim highlight uses the same normal in corners as on the edges (1.x flipped it, leaving notches
  at corner/edge junctions).
- One map image: R,G displacement, B lighting (128 neutral; light above, shade below). The separate
  specular image and second `feImage` are gone.
- The filter region is the element box in `objectBoundingBox` units (primitives stay in px), so a
  resize rewrites nothing on the graph and the old map stretches until the new one lands.
  Pixel-identical to the previous explicit-px region (verified by screenshot diff).
- Dispersion is radial (three `feDisplacementMap` passes at `1 ∓ 0.02·dispersion` of the scale,
  channel-isolated and summed) instead of a horizontal `feOffset` fringe masked to the bezel.
- Noise blur rendered its first frame at 5× the strength of every later frame; fixed.

### Fixed

- Multiple glass instances no longer share one map cache; each handle holds references into a
  registry that revokes a URL when its last holder lets go. (1.x instances revoked each other's
  images on every update.)
- Updates are coalesced and ordered; overlapping async rebuilds can no longer apply out of order.
- Device pixel ratio changes regenerate the maps.
- `types` is the first `exports` condition, so TypeScript resolves the declarations.
- The native `canvas` package is no longer a dependency (it was only used by a test baseline).
- The hidden `<svg>` is 0×0 instead of the full effect size.

### Removed

- Lit, the Lit components, the DOM-bound filter stage builders, the global cache, `filterRes`,
  `xlink:href` dual-sets, dead duplicate files, `chromaticBezelFraction`/`chromaticBezelFactor`.

### Internal

- 204 tests: fixture and invariant tests for the optics (exact symmetry, rim placement, equivalence
  of the mirrored band walk with a naive one), spec snapshots, scheduler, registry, support
  detection and lifecycle tests (fake DOM for the DOM layer, happy-dom for the elements). CI runs
  typecheck, tests and the build on Node 22.
- `src/core` is typechecked with no DOM lib to keep it pure.
- Band geometry is computed for one quadrant and mirrored (a quarter of the per-pixel work).

## 1.0.0

Lit-based `<liquid-glass-container>` / `<liquid-glass-filter>` with the same optics.
