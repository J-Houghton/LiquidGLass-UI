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

The full usage and API guide, with every option, parameter range, render path, framework
snippet and troubleshooting entry, is [`docs/usage.md`](docs/usage.md).

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

### Bring your own content (Safari and Firefox, experimental)

`backdrop-filter: url()` renders only in Chromium. Where it does not, the same lens can be applied
with plain `filter: url()` to an element whose pixels you own, with the lens as a subregion at the
glass's position. Pass that element as `content`:

```ts
const handle = attachLiquidGlass(panel, {
  content: document.querySelector('#hero'), // the element behind the panel
  // mode: 'auto' (default): backdrop lens on Chromium, content lens elsewhere; 'content' forces it
});
// after moving the panel yourself (drag, layout change): handle.relayout()
```

The content element gets `filter: url(#id)`; the panel keeps its tint and radius. The lens follows
size changes of both elements and scrolling; moving the panel needs `relayout()` (attribute writes,
no map work). One lens per content element. In content mode the blur runs before displacement,
the lens is saturated inside the filter, and the rectangle corners outside the rounded shape get
the lens blur (invisible at the default 0.2 px). Caveats from the engines: Safari leaves `<video>`
and WebGL canvases unfiltered (WebKit bug 322588) and downscales filtered content over 4096 device
px per side (the handle warns once); Safari before 27 needs a fresh filter id per update (done
automatically; fixed in Safari 27.0); Firefox filters on the CPU (Mozilla bug 1883933). Filter the
smallest element that sits behind the glass, not the page.

### Motion (press, drag, hover)

What makes glass read as liquid is motion more than optics: a spring that overshoots on release and
a squash that follows the pointer's velocity. `attachGlassMotion` drives a glass with both from one
`requestAnimationFrame` loop that sleeps at rest:

```ts
import { attachLiquidGlass, attachGlassMotion } from 'liquid-glass-filter';

const glass = attachLiquidGlass(button);
const motion = attachGlassMotion(glass, {
  press: { scale: 1.045, dim: 0.85, spring: { duration: 0.35, bounce: 0.3 } }, // the defaults
  drag: true, // squash/stretch from pointer velocity while pressed; caps: 12 % stretch, 14° skew
  hover: false, // or { scale: 1.02 }
});
// drive it yourself if your drag code owns the pointer: motion.press(), motion.release(),
// motion.impulse(vx, vy) in px/s, motion.hover(on); motion.frame has the current numbers
```

The transform (`scale`, `skewX`) is written to the target and removed at rest; while pressed the
lens relaxes to `dim` through `setIntensity`. Springs are closed-form, parameterised like Apple's
`Spring` (`{ duration, bounce }`) or physically (`{ stiffness, damping, mass }`), so a release
mid-press keeps its velocity. Under `prefers-reduced-motion` presses snap and the squash is off.
In content mode nothing is transformed by default (the lens would not follow the target), only
the dim applies; pass `element` to transform something else. The pure model is its own entry,
`liquid-glass-filter/motion`: `stepSpring`, `springPhysics`, `springLinearEasing` (a CSS `linear()`
string plus duration for plain transitions), `squashSample`, `squashDecay`, `squashDeformation`.
On the element: `<liquid-glass-container motion="press drag hover">` (any subset; the bare
attribute means press and drag).

### Light that follows the page and the pointer

The rim highlight's direction is a graph attribute (`specularAngleDeg`), not part of the map, so
it can move every frame. `attachGlassLight` aims it from the page: a scene light fixed above the
viewport's top centre, so each glass is lit according to where it sits and keeps being so as the
page scrolls, blended toward the pointer when it comes within reach.

```ts
import { attachLiquidGlass, attachGlassLight } from 'liquid-glass-filter';

const glass = attachLiquidGlass(card);
const light = attachGlassLight(glass, {
  scene: 'viewport',        // default; or { x, y } in viewport px, a function of the viewport size, or false
  pointer: { radius: 160 }, // default; the pointer owns the light on the glass and lets go beyond 160 px
  smoothing: 0.35,          // per-frame easing; 1 snaps; reduced motion snaps
});
light.update();             // after moving the glass yourself; scroll and resize are followed
light.setPointer({ x, y }); // or feed a pointer from your own code; null when it leaves
```

Two glasses side by side are lit from the same place, which reads as one light over the page; a
glass under the cursor gets the highlight on the side facing it. Angles ease in one frame loop
that sleeps at rest, and the rim is symmetric (a light and its opposite are the same), so the
easing always takes the short way. On the element: `<liquid-glass-container light="scene pointer">`
(any subset; the bare attribute means both).

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
the `blurAmount` property because `HTMLElement.blur()` already exists. `appear="400"` plays the
entrance on connect; `element.replayAppear()` plays it again. `content="#hero"` (a selector,
resolved in the element's root on connect) and `mode="content"` select the content-side lens
described above.

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
| `dispersion` (0), `dispersionUnit` (`relative`) | Chromatic dispersion, three displacement passes; 0 disables. `relative`: red and blue at `1 ∓ 0.02·dispersion` times the green scale (the fringe grows with the lens). `px`: `∓ dispersion` px from green (a fringe of fixed width). |
| `blurKind` (`gauss`), `blur` (0.2) | Gaussian blur, or `noise1`/`noise2` for a textured, organic distortion. |
| `blurStage` (`after`) | `after` blurs the refracted result; `before` blurs the backdrop first and then displaces it, which keeps the rim and the dispersion fringe crisp. The playground's A/B twin shows both side by side. |
| `specular` (true), `specularAngleDeg` (60), `specularStrength` (0.81) | Rim highlight on/off, light direction, brightness. |
| `shade` (0) | Edge darkening, 0..1: how dark the glass gets where the lens thins the backdrop the most (just inside the rim), fading to nothing where it is flat. Reads as the thickness of the edge; 0.35 is a good start. |
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
| `appear` (none) | Entrance: the lens eases in from flat glass over this many ms (or `{ duration, easing }`). Attribute-only updates, no map work; skipped under `prefers-reduced-motion`. Replay any time with `handle.appear()`. |
| `content`, `mode` (`'auto'`) | Content-side lens for engines without `backdrop-filter: url()`: the element to filter, and whether to use it only where the backdrop lens fails (`'auto'`) or always (`'content'`). See "Bring your own content". |
| `contentSupport`, `bumpFilterId`, `warn` | Overrides for content mode: `filter: url()` detection, the Safari < 27 fresh-id-per-update workaround (`createGlassFilter` option too), and where the oversized-content warning goes. |
| `size`, `radius`, `applyStyles` | Sizing source, corner radius source, whether to write styles onto the target. |
| `regionPadding` (0) | Enlarge the filter region around the box so displaced samples can come from just outside it (concave profiles). Output is still clipped to the box. |
| `maxMapPixels` (320 000) | Pixel budget per map: above it the map is generated at a lower ratio and stretched by the filter (the rim keeps its CSS-px width). `Infinity` disables. |
| `sizeBucket` (1.02) | Maps are generated for the element size rounded up to a 2 % geometric grid (exact below 64 px) and stretched to the exact box, so dragging a resize handle reuses maps instead of regenerating one per pixel. `1` disables. |
| `rimPx` (2) | Width of the rim highlight. |
| `mount`, `dpr`, `encodeImage`, `revokeImage`, `registry`, `document` | Where the `<svg>` goes, device pixel ratio, and seams for tests, workers and shared caches. |

## Handle

| Member | |
|---|---|
| `mode`, `support` | `'glass'` (backdrop lens), `'content'` (content-side lens) or `'frost'`; what detection concluded. |
| `content`, `relayout()`, `getContentStyle()` | Content mode: the filtered element, re-measure the lens offset after a move (attribute writes only), and the declaration the content element needs (`filter`) for `applyStyles: false`. |
| `lens`, `setLens({ x, y })` | The lens offset inside the content element (`createGlassFilter` option `lens`); null in backdrop mode. |
| `update(patch)` | Merge and re-render. Calls in the same tick are coalesced; the newest parameters win. Returns a promise that resolves when the DOM reflects the patch. |
| `ready` | Resolves after the first render. |
| `params` | Current, validated parameters. |
| `url`, `id`, `filterElement`, `svgElement` | The filter reference and its elements. |
| `setDpr(n)`, `refresh()` | Re-render at another device pixel ratio / with current parameters. |
| `intensity`, `setIntensity(k)`, `appear(ms?)` | A 0..1 multiplier on displacement and rim (graph attributes only); `appear` eases it from 0 to 1. |
| `debug` | `mapUrl` (R,G displacement), `lightUrl` (R,G rim normal, B shade), `mapDpr`, `mapWidth`, `mapHeight`, `physicalMaxDisplacementPx`, `displacementPx`, `renders`. |
| `destroy()` | Removes everything the handle created. Idempotent. |
| `getStyle()` (attach only) | The declarations the effect needs, for `applyStyles: false`. |

## Browser support

The lens needs `backdrop-filter` to accept an SVG filter with `feImage` + `feDisplacementMap`.
Verified against engine sources and bug trackers in November 2026:

| Engine | Result | Source |
|---|---|---|
| Chromium (Chrome, Edge, Opera, Brave, desktop and Android) | Renders the lens. | Blink `fe_displacement_map.cc`; the backdrop-filter explainer (M76) |
| WebKit (Safari, every iOS browser) through Safari 27.2 | Parses the value, drops the whole `backdrop-filter` list when it contains an SVG reference. Gets the frost fallback. | WebCore `RenderLayerBacking.cpp`; WebKit bug 245510 |
| Gecko (Firefox) through 159 | Parses the value, renders nothing for this graph. Gets the frost fallback. | Mozilla bug 1961378 |

Plain `filter: url()` with the same graph renders in all three engines (Mozilla bug 1883933), which
is what the content-side lens uses.

`CSS.supports()` cannot tell these apart (support is defined at parse level), so
`detectGlassSupport()` is a parse check for `url()` in `backdrop-filter` plus an engine check
(Client Hints brands, UA string fallback). That is the same compromise every current library makes;
it will be revisited if WebKit's in-progress software path ships. Override it for a page with
`<html data-liquid-glass-support="force">` or `"off"`. The frost fallback is
`backdrop-filter: blur() saturate()`, the tint, and a 1px inset highlight; no refraction. For real
refraction in WebKit and Gecko, hand the lens the element behind it ("Bring your own content"):
`filter: url()` on owned pixels renders in all three engines.

Handles with identical geometry share one map image through a reference-counted registry that also
keeps the last 16 released maps warm, so a list of same-size cards costs one map and a remount costs
nothing.

## Development

```bash
npm ci
npm run dev          # playground at demo/ (deployed to GitHub Pages from main)
npm test             # vitest, once
npm run typecheck    # whole repo + a no-DOM check of src/core
npm run build        # dist/: index, core, elements (ESM + .d.ts)
BENCH=1 npx vitest run tests/bench   # banding benchmark vs. the original algorithm

# visual checks: deterministic harness + headless Chrome/Edge screenshots, no extra dependencies
npm run dev -- --port 5178
node scripts/visual-shot.mjs out/ab.png 'a={"shade":0}&b={"shade":0.35}&base={"dispersion":2}'
node scripts/png-diff.mjs out/before.png out/after.png out/diff.png
```

Layout: `src/core` (pure engine), `src/dom` (browser glue), `src/elements` (custom elements),
`demo/` (playground), `tests/` (fixtures pin the maps; regenerate only on purpose with
`UPDATE_FIXTURES=1`). Import direction is one-way: `core` and `motion` are pure and import nothing
outside themselves, `dom` builds on them, `elements` on `dom`, `demo` on everything. Any change to
the optics or the filter graph lands with a fixture or snapshot and, for anything visible, a
before/after screenshot diff from the harness.

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

`fromLegacyParams()` performs this mapping. Other 2.0 changes worth knowing: ESM only, no
elements registered on import (call `defineLiquidGlassElements()`), validation clamps instead of
rejecting, the `displacement-updated` event is replaced by `onRender` / `liquid-glass:render`,
and the band is sampled at pixel centers so the map is an exact mirror image across both axes.

## License

MIT
