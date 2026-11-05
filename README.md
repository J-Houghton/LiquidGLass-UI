# liquid-glass-filter

Physics-based "liquid glass" refraction for the web. A pure TypeScript engine turns a bezel
profile and an index of refraction into a displacement map (Snell's law, per pixel), builds an
SVG filter around it, and applies the result with `backdrop-filter`. Content inside the glass
stays crisp; whatever is behind it refracts.

- **Headless.** One function attaches the effect to any element and returns `update` / `destroy`.
- **Zero runtime dependencies.** ESM, typed, tree-shakeable, no framework.
- **Safe to import anywhere.** No DOM access at import time, so it works in Next.js server bundles; the
  calls run in the browser.
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

await glass.update({ dispersion: 1.2 });   // coalesced; resolves when the DOM reflects it
glass.destroy();                            // removes the filter, revokes its images
```

`attachLiquidGlass` measures the element (and follows it with a `ResizeObserver`), mounts a hidden
`<svg><filter>` inside it, and writes `backdrop-filter: url(#id) saturate(…)` plus the tint as
`background-color`. Its corner radius is read from the element's computed `border-radius`, or pass
`radius` in px. Pass `applyStyles: false` and use `glass.getStyle()` if you would rather own the styles.

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
equal that element's size.

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
`blur-std-dev`, `show-specular`, `frost`, `chromatic-bezel-factor`) are still accepted. On the
element, the `blur` parameter is the `blurAmount` property because `HTMLElement.blur()` already exists.

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
| `surface` (`convex_squircle`) | Rim profile: `convex_circle`, `convex_squircle`, `concave`, `lip`. |
| `refractiveIndex` (1.5) | Index of refraction. 1.0 means no refraction. |
| `glassThickness` (31.25) | Thickness of the flat glass; longer path, more displacement. |
| `displacementScale` (180) | Maximum displacement in px. The optics set the shape, this sets the strength. |
| `dispersion` (0) | Chromatic aberration strength; 0 disables the stage. |
| `chromaticBezelFraction` (0.25) | Outer share of the rim that disperses colour. |
| `blurKind` (`gauss`), `blur` (0.2) | Gaussian blur, or `noise1`/`noise2` for a textured, organic distortion. |
| `specular` (true), `specularAngleDeg` (60), `specularStrength` (0.9) | Rim highlight on/off, light direction, brightness. |
| `tint` (0.05) | Black tint over the glass, 0 to 1. |
| `saturation` (1) | Applied to the backdrop with the filter. |

Values are validated and clamped; `handle.params.notes` lists anything that was adjusted.

## Handle

| Member | |
|---|---|
| `update(patch)` | Merge and re-render. Calls in the same tick are coalesced; the newest parameters win. Returns a promise that resolves when the DOM reflects the patch. |
| `ready` | Resolves after the first render. |
| `params` | Current, validated parameters. |
| `url`, `id`, `filterElement`, `svgElement` | The filter reference and its elements. |
| `setDpr(n)`, `refresh()` | Re-render at another device pixel ratio / with current parameters. |
| `debug` | `displacementMapUrl`, `specularMapUrl`, `physicalMaxDisplacementPx`, `renders`. |
| `destroy()` | Removes everything the handle created. Idempotent. |
| `getStyle()` (attach only) | The declarations the effect needs, for `applyStyles: false`. |

## Browser support

The effect depends on `backdrop-filter` accepting an SVG filter reference. Chromium and Firefox
render it. WebKit/Safari support is unverified at the time of writing; treat the effect as a
progressive enhancement there. `isLiquidGlassSupported()` currently only checks for
`backdrop-filter` itself and is provisional.

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
| `chromaticBezelFactor` (4 = outer 25 %) | `chromaticBezelFraction` (0.25) |
| `glassThickness` (passed through a smoothstep curve) | `glassThickness` (literal px; 1.x `50` is `31.25`) |

`fromLegacyParams()` performs this mapping. See `CHANGELOG.md` for everything else.

## License

MIT
