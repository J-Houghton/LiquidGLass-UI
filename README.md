# liquid-glass-filter

Physics-based "liquid glass" refraction for the web. A pure TypeScript engine turns a bezel
profile and an index of refraction into a displacement map (Snell's law, per pixel), builds an
SVG filter around it, and applies the result with `backdrop-filter`. Content inside the glass
stays crisp; whatever is behind it refracts.

- **Headless.** One function attaches the effect to any element and returns `update` / `destroy`.
- **Zero runtime dependencies.** ESM, typed, tree-shakeable, no framework.
- **Safe to import anywhere.** No DOM access at import time, so it works in Next.js server bundles; the
  calls run in the browser.
- **Honest about browsers.** The SVG lens renders in Chromium. Elsewhere the same call applies a
  CSS frost fallback (see [Browser support](#browser-support)).
- **Optional custom elements** behind a separate entry point.

## Install

```bash
npm install liquid-glass-filter
```

## Use

### Any element

```ts
import { attachLiquidGlass } from 'liquid-glass-filter';

const glass = attachLiquidGlass(document.querySelector('.card')!, {
  refractiveIndex: 1.5,
  bezelWidth: 40,
  tint: 0.05,
});

glass.mode;                                 // 'glass' (SVG lens) or 'frost' (CSS fallback)
await glass.update({ dispersion: 1.2 });    // coalesced; resolves when the DOM reflects it
glass.destroy();                            // removes the filter, revokes its image
```

`attachLiquidGlass` measures the element (and follows it with a `ResizeObserver`), mounts a hidden
`<svg><filter>` inside it, and writes `backdrop-filter: url(#id) saturate(…)` plus the tint as
`background-color`. Its corner radius is read from the element's computed `border-radius`, or pass
`radius` in px. Pass `applyStyles: false` and use `glass.getStyle()` if you would rather own the styles.
The element gets `data-liquid-glass="glass"` or `"frost"` once the first render has landed, so you can
style the two modes differently in CSS.

### React / Next.js

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { attachLiquidGlass, type GlassParams, type LiquidGlassHandle } from 'liquid-glass-filter';

export function GlassCard({ children, ...params }: React.PropsWithChildren<Partial<GlassParams>>) {
  const ref = useRef<HTMLDivElement>(null);
  const glass = useRef<LiquidGlassHandle | null>(null);

  useEffect(() => {
    glass.current = attachLiquidGlass(ref.current!, params);
    return () => glass.current?.destroy();
  }, []);

  useEffect(() => {
    void glass.current?.update(params);
  }, [params]);

  return <div ref={ref} className="card">{children}</div>;
}
```

### Bring your own CSS (filter only)

```ts
import { createGlassFilter } from 'liquid-glass-filter';

const filter = createGlassFilter(document.body, { width: 320, height: 160, radius: 24 });
panel.style.backdropFilter = filter.url;   // 'url(#lg-1)'
```

The filter region lives in the styled element's coordinate space, so `width` and `height` must
equal that element's size. This path does no support detection; pair it with `detectGlassSupport()`.

### HTML custom elements

```ts
import { defineLiquidGlassElements } from 'liquid-glass-filter/elements';
defineLiquidGlassElements();   // no-op on a server; idempotent
```

```html
<liquid-glass-container radius="24" refractive-index="1.5" tint="0.05" style="width: 320px; height: 160px">
  Content stays sharp
</liquid-glass-container>

<liquid-glass-filter filter-id="my-glass" width="320" height="160"></liquid-glass-filter>
<div style="backdrop-filter: url(#my-glass); width: 320px; height: 160px"></div>
```

Attributes are the parameter names in kebab-case. The 1.x attribute names (`scale-px`,
`blur-std-dev`, `show-specular`, `frost`) are still accepted. On the element, the `blur` parameter is
the `blurAmount` property because `HTMLElement.blur()` already exists.

### Engine only

```ts
import { displacementCurve, displacementMap, buildFilterSpec, filterSpecToSvg } from 'liquid-glass-filter/core';
```

`/core` has no DOM dependency at all: it returns plain `{ width, height, data }` pixel buffers and a
data description of the filter, and runs in Node, workers, or tests.

## Parameters

All lengths are CSS pixels. Defaults in parentheses.

| Parameter | Meaning |
|---|---|
| `width`, `height` (300, 120) | Effect size. `attachLiquidGlass` measures these for you. |
| `radius` (60) | Corner radius of the glass shape. |
| `bezelWidth` (60) | Width of the refracting rim. The flat center refracts nothing. |
| `surface` (`convex_squircle`) | Rim profile: `convex_circle`, `convex_squircle`, `concave`, `lip`. The squircle `(1-(1-x)^4)^(1/4)` is the profile kube.io established as the reference. |
| `refractiveIndex` (1.5) | Index of refraction. 1.0 means no refraction. |
| `glassThickness` (31.25) | Thickness of the flat glass; longer path, more displacement. |
| `displacementScale` (180) | Maximum displacement in px. The optics set the shape, this sets the strength. |
| `physicalScale` (false) | Ignore `displacementScale` and use the displacement the optics actually produce, so IOR and thickness set the strength. |
| `dispersion` (0) | Chromatic dispersion: red and blue are displaced at `1 ∓ 0.02·dispersion` times the green scale. 0 disables the three-pass stage. |
| `blurKind` (`gauss`), `blur` (0.2) | Gaussian blur, or `noise1`/`noise2` for a textured, organic distortion. |
| `specular` (true), `specularAngleDeg` (60), `specularStrength` (0.81) | Rim highlight on/off, light direction, brightness. |
| `tint` (0.05) | Black tint over the glass, 0 to 1. |
| `saturation` (1) | Applied to the backdrop with the filter. |

Values are validated and clamped; `handle.params.notes` lists anything that was adjusted.

### Options (not parameters)

| Option | |
|---|---|
| `fallback` (`'frost'`) | What to do where the SVG lens cannot render: `'frost'` applies CSS blur, tint and a 1px rim hint and generates no maps; `'none'` attaches the filter regardless. |
| `support` | Override detection with `'full'`, `'frost'` or `'none'`. |
| `frostBlurPx` (12) | Blur radius of the frost fallback. |
| `reducedTransparency` (`'auto'`) | Frostier, higher-contrast glass: tint ≥ 0.35, blur ≥ 1.5, no dispersion. `'auto'` follows `prefers-reduced-transparency` where the browser exposes it (Chromium does, Safari does not), or pass a boolean from your own setting. |
| `size`, `radius`, `applyStyles` | Sizing source, corner radius source, whether to write styles onto the target. |
| `regionPadding` (0) | Enlarge the filter region around the box so displaced samples can come from just outside it (concave profiles). Output is still clipped to the box. |
| `rimPx` (2) | Width of the rim highlight. |
| `mount`, `dpr`, `encodeImage`, `revokeImage`, `registry`, `document` | Where the `<svg>` goes, device pixel ratio, and seams for tests, workers and shared caches. |

## Handle

| Member | |
|---|---|
| `mode`, `support` | `'glass'` or `'frost'`; what detection concluded. |
| `update(patch)` | Merge and re-render. Calls in the same tick are coalesced; the newest parameters win. Returns a promise that resolves when the DOM reflects the patch. |
| `ready` | Resolves after the first render. |
| `params` | Current, validated parameters. |
| `url`, `id`, `filterElement`, `svgElement` | The filter reference and its elements. |
| `setDpr(n)`, `refresh()` | Re-render at another device pixel ratio / with current parameters. |
| `debug` | `mapUrl` (one image: R,G displacement, B rim light), `physicalMaxDisplacementPx`, `displacementPx`, `renders`. |
| `destroy()` | Removes everything the handle created. Idempotent. |
| `getStyle()` (attach only) | The declarations the effect needs, for `applyStyles: false`. |

Handles with identical geometry share one map image through a reference-counted registry, so a list
of same-size cards costs one map.

## Browser support

The lens needs `backdrop-filter` to accept an SVG filter with `feImage` + `feDisplacementMap`.
Verified against engine sources and bug trackers in November 2026 (details and citations in
`docs/research-liquid-glass-2026.md`):

| Engine | Result |
|---|---|
| Chromium (Chrome, Edge, Opera, Brave, desktop and Android) | Renders the lens. |
| WebKit (Safari, every iOS browser) through Safari 27.2 | Parses the value, drops the whole `backdrop-filter` list when it contains an SVG reference. Gets the frost fallback. |
| Gecko (Firefox) through 159 | Parses the value, renders nothing for this graph. Gets the frost fallback. |

`CSS.supports()` cannot tell these apart (support is defined at parse level), so
`detectGlassSupport()` is an engine check (Client Hints brands, UA string fallback) plus a parse
check. That is the same compromise every current library makes; it will be revisited if WebKit's
in-progress software path ships. The frost fallback is `backdrop-filter: blur() saturate()`, the
tint, and a 1px inset highlight; no refraction.

## Development

```bash
npm ci
npm run dev          # playground at demo/ (deployed to GitHub Pages from main)
npm test             # vitest, once
npm run typecheck    # whole repo + a no-DOM check of src/core
npm run build        # dist/: index, core, elements (ESM + .d.ts)
BENCH=1 npx vitest run tests/bench   # banding benchmark vs. the original algorithm
```

Layout: `src/core` (pure engine), `src/dom` (browser glue), `src/elements` (custom elements),
`demo/` (playground), `tests/` (fixtures pin the maps; regenerate only on purpose with
`UPDATE_FIXTURES=1`). See `CLAUDE.md` for the rules and `docs/modernization-plan.md` for the design.

## Migrating from 1.x

1.x shipped Lit web components; 2.0 is headless with optional hand-rolled elements. The elements keep
the 1.x tag and attribute names, so HTML usage keeps working. The parameter names changed:

| 1.x | 2.0 |
|---|---|
| `scalePx` | `displacementScale` |
| `blurStdDev` | `blur` (`blurAmount` as an element property) |
| `showSpecular` | `specular` |
| `frost` | `tint` |
| `chromaticBezelFactor` | removed; dispersion is now three displacement passes and needs no mask |
| `specularStrength` (applied twice) | `specularStrength` applied once; a 1.x value `s` is `s · min(1, s)` (0.9 → 0.81) |
| `glassThickness` (passed through a smoothstep curve) | `glassThickness` (literal px; 1.x `50` is `31.25`) |

`fromLegacyParams()` performs this mapping. See `CHANGELOG.md` for everything else.

## License

MIT
