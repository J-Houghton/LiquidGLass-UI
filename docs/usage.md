# liquid-glass-filter: usage and API guide

Version 2.0. This is the long-form companion to the README: everything you can call, every
option and parameter with its default and range, what each render path costs, and the recipes
and pitfalls that come up when you drop the effect into a real page.

Contents

1. [Install and entry points](#1-install-and-entry-points)
2. [Five-minute start](#2-five-minute-start)
3. [Which API to use](#3-which-api-to-use)
4. [`attachLiquidGlass`](#4-attachliquidglass)
5. [`createGlassFilter`](#5-createglassfilter)
6. [Parameters](#6-parameters)
7. [Browser support, fallback and the content-side lens](#7-browser-support-fallback-and-the-content-side-lens)
8. [Motion](#8-motion)
9. [Custom elements](#9-custom-elements)
10. [Frameworks and SSR](#10-frameworks-and-ssr)
11. [Engine only (`/core`)](#11-engine-only-core)
12. [Performance](#12-performance)
13. [Accessibility](#13-accessibility)
14. [Recipes](#14-recipes)
15. [Troubleshooting](#15-troubleshooting)
16. [Type index](#16-type-index)

## 1. Install and entry points

The package is not on npm yet. Consume it from a local checkout:

```bash
# in this repository
npm ci && npm run build          # writes dist/ with ESM entries and .d.ts; a guard checks them

# in your project (npm symlinks the folder and resolves "exports" to dist/)
npm install ../LiquidGLass-UI
```

For live source during development, alias the package to `src/` instead of installing it, for
example in Vite:

```ts
// vite.config.ts of the consuming project
resolve: { alias: { 'liquid-glass-filter': '/absolute/path/LiquidGLass-UI/src/index.ts' } }
```

Once it is published, `npm install liquid-glass-filter` replaces the first step.

| Entry | Import | What it holds | DOM at import? |
|---|---|---|---|
| `liquid-glass-filter` | main | `attachLiquidGlass`, `createGlassFilter`, `attachGlassMotion`, support detection, the map registry, and everything from `/core` and `/motion` re-exported | no |
| `liquid-glass-filter/core` | engine | parameters, optics, map generation, the filter graph as data | no (also no DOM types) |
| `liquid-glass-filter/motion` | motion model | closed-form spring, velocity squash | no |
| `liquid-glass-filter/elements` | custom elements | `defineLiquidGlassElements`, `LiquidGlassElement`, `LiquidGlassFilterElement` | no; registration happens when you call `defineLiquidGlassElements()` |

Everything is ESM, typed, tree-shakeable (`sideEffects: false`) and free of runtime dependencies.
No module touches `document` or `window` when imported, so any entry is safe in a Next.js
server bundle; the functions do the DOM work when called.

**Content Security Policy.** The displacement map is a PNG blob URL loaded by `<feImage>`. A
CSP needs `img-src blob:` (or pass your own `encodeImage` that returns a data URL and allow
`data:` instead).

## 2. Five-minute start

```html
<div class="card" style="border-radius: 24px; width: 320px; height: 160px">
  Crisp text above the glass
</div>
```

```ts
import { attachLiquidGlass } from 'liquid-glass-filter';

const glass = attachLiquidGlass(document.querySelector('.card')!, {
  bezelWidth: 40,          // width of the refracting rim, px
  refractiveIndex: 1.5,
  tint: 0.05,              // black overlay alpha
  shade: 0.35,             // edge darkening, reads as thickness
  appear: 400,             // entrance from flat glass, ms
});

glass.mode;                        // 'glass' | 'content' | 'frost'
await glass.update({ dispersion: 1.5 });
glass.destroy();
```

What happened:

1. Support was detected. Chromium renders `backdrop-filter: url(#svg)`; Safari and Firefox do
   not, and get a CSS frost unless you hand them content to refract (section 7).
2. The element was measured and a `ResizeObserver` now follows its border box. Its corner
   radius was read from the computed `border-radius`.
3. A displacement map was generated on the CPU for that size (a few ms), encoded to a PNG blob
   URL, and a hidden `<svg><filter>` was mounted inside the element.
4. The element received `backdrop-filter: url(#id) saturate(1)`, `background-color: rgba(0,0,0,.05)`
   and `data-liquid-glass="glass"`. Children stay crisp; what is behind refracts.

## 3. Which API to use

| You want | Use |
|---|---|
| The effect on an element, with detection, fallback, sizing and styles handled | `attachLiquidGlass` (section 4) |
| Just the SVG filter, you write the CSS and know the size | `createGlassFilter` (section 5) |
| Markup only, no build step for the effect | `<liquid-glass-container>` (section 9) |
| Refraction in Safari and Firefox too, on content you own | `attachLiquidGlass` with `content` (section 7) |
| Press/drag/hover liquid motion | `attachGlassMotion` (section 8) |
| Maps or filter markup on a server or in a worker, no DOM | `/core` (section 11) |

## 4. `attachLiquidGlass`

```ts
attachLiquidGlass(target: HTMLElement, options?: LiquidGlassOptions): LiquidGlassHandle
```

Options are every [parameter](#6-parameters) (`width` and `height` are measured unless `size` is an
object) plus the keys below. Nothing is required.

| Option | Default | Meaning |
|---|---|---|
| `size` | `'observe'` | Measure the target's border box and follow it with a `ResizeObserver`, or fix it with `{ width, height }`. |
| `radius` | `'css'` | Corner radius: read the computed `border-radius` (px values only), or a number in px, which is also written as `border-radius`. |
| `applyStyles` | `true` | Write the styles onto the target (and the content element in content mode). `false`: use `getStyle()` / `getContentStyle()` yourself. Inline values are restored on `destroy()`. |
| `fallback` | `'frost'` | Where the SVG lens cannot render: `'frost'` (CSS blur, tint, 1 px rim hint, no maps) or `'none'` (attach the SVG filter regardless). |
| `support` | detected | Force `'full'`, `'frost'` or `'none'`. Tests in jsdom-like environments pass `'full'`. |
| `frostBlurPx` | `12` | Blur radius of the frost fallback. The final blur is `frostBlurPx + (reduced transparency ? 8 : 0) + max(0, blur − 0.2) × 4`. |
| `reducedTransparency` | `'auto'` | Frostier, higher-contrast glass: tint at least 0.35, blur at least 1.5, no dispersion. `'auto'` follows `prefers-reduced-transparency` (Chromium exposes it, Safari does not); a boolean drives it from your own setting. |
| `appear` | none | Entrance: intensity 0 → 1 over this many ms, or `{ duration, easing }`. Attribute-only updates. Skipped under `prefers-reduced-motion` and in frost mode. |
| `content` | none | Content-side lens: the element to filter with `filter: url()` where the backdrop lens does not render. Section 7. |
| `mode` | `'auto'` | With `content`: `'auto'` uses the backdrop lens on Chromium and the content lens elsewhere; `'content'` forces the content lens everywhere. |
| `contentSupport` | detected | Force the `filter: url()` support verdict. |
| `warn` | `console.warn` | Receives the one-time warning when the content element exceeds 4096 device px on a side. |
| `resizeObserver`, `matchMedia`, `animationFrame`, `now` | globals | Seams for tests. |
| `onRender` | none | Called with the handle after every completed render. |
| plus every `createGlassFilter` option | | `id`, `mount`, `dpr`, `maxMapPixels`, `sizeBucket`, `rimPx`, `regionPadding`, `intensity`, `bumpFilterId`, `encodeImage`, `revokeImage`, `registry`, `document` (section 5). |

### The handle

| Member | Meaning |
|---|---|
| `target` | The element. |
| `mode` | `'glass'` (backdrop lens), `'content'` (content-side lens), `'frost'` (CSS fallback). Also written as `data-liquid-glass` on the target. |
| `support` | What detection concluded: `'full'`, `'frost'`, `'none'`. |
| `content` | The filtered element in content mode, else `null`. |
| `params` | Current parameters after validation and clamping; `params.notes` lists every adjustment. |
| `ready` | Resolves after the first render has been applied to the DOM. |
| `update(patch)` | Merge and re-render. Calls in the same tick are coalesced; if a render is in flight the newest parameters win. Resolves when the DOM reflects the patch. Only [map keys](#6-parameters) cost CPU; the rest are attribute writes. |
| `refresh()` | Re-render with current parameters. |
| `intensity`, `setIntensity(k)` | A 0..1 multiplier on displacement, rim, shade and px dispersion. Attribute-only, cheap per frame. |
| `appear(ms?)` | Play the entrance again. |
| `setDpr(n)`, `dpr` | Regenerate the maps at another device pixel ratio (tracked automatically unless you fixed `dpr`). |
| `relayout()` | Re-measure the target (and its offset inside the content element). Needed after you move the target in content mode. |
| `lens`, `setLens({ x, y })` | Content mode: where the lens sits inside the content element, px. |
| `getStyle()` | The declarations the target needs, as `CSSStyleDeclaration` keys (`backdropFilter`, `WebkitBackdropFilter`, `backgroundColor`, `boxShadow`, `borderRadius`), for `applyStyles: false`. |
| `getContentStyle()` | Content mode: `{ filter: 'url(#id)' }` for the content element. |
| `url`, `id`, `filterElement`, `svgElement` | The filter reference and its elements. `id` changes per render when `bumpFilterId` is on. |
| `debug` | `mapUrl`, `mapDpr`, `mapWidth`, `mapHeight`, `physicalMaxDisplacementPx`, `displacementPx`, `renders`. |
| `destroyed`, `destroy()` | Disconnect observers, restore inline styles, remove the `<svg>`, release the map. Idempotent. |

### Sizing rules

The filter region is the element's border box, so the engine must know its exact layout size.
`size: 'observe'` keeps that true through layout changes; a fixed `size` is for elements whose
size you control. When the target has no layout yet (`display: none`, not yet mounted), the
default or given `width`/`height` is used and the observer corrects it on first layout.

CSS transforms on the target scale the backdrop sampling area along with the box, which is what
the motion module relies on. They do not change the measured size.

## 5. `createGlassFilter`

```ts
createGlassFilter(host: Element, options?: GlassFilterOptions): GlassFilterHandle
```

The filter alone: no detection, no styles, no observers. You apply `handle.url` yourself and
keep `width`/`height` equal to the styled element's size.

```ts
const filter = createGlassFilter(document.body, { width: 320, height: 160, radius: 24 });
panel.style.backdropFilter = filter.url;   // 'url(#lg-1)'
await filter.ready;
```

| Option | Default | Meaning |
|---|---|---|
| `id` | `lg-<n>` | Filter id, unique per page. Set it when the styled element lives in a different document or you need a stable name. |
| `mount` | `host` | Where the hidden 0×0 `<svg>` is appended. Keep it in the same tree scope as the element that references `url(#id)` (inside the same shadow root, for example). |
| `dpr` | `window.devicePixelRatio`, tracked | Ratio the maps are generated at. Passing a number fixes it. |
| `maxMapPixels` | `320000` | Pixel budget per map. Above it the map is generated at a lower ratio and stretched by the filter; the displacement field is smooth and the rim keeps its CSS width. `Infinity` disables. |
| `sizeBucket` | `1.02` | Sizes above 64 px are rounded up to a 2 % geometric grid for the map and stretched to the exact box, so a resize burst reuses maps. `1` disables (exact maps). |
| `rimPx` | `2` | Gaussian width of the rim highlight, CSS px. |
| `regionPadding` | `0` | Enlarge the filter region around the box so displaced samples can come from just outside it (concave profiles). Output stays clipped to the box. Ignored in content mode. |
| `intensity` | `1` | Initial intensity multiplier. |
| `lens` | none | Content-side graph with the lens at this `{ x, y }` inside the filtered element. `attachLiquidGlass` sets this for you. |
| `bumpFilterId` | `false` | New filter id on every re-render; `handle.id`/`handle.url` follow. Safari before 27 needs it for `filter: url()`. |
| `encodeImage` | PNG blob URL via canvas | `(img: RGBAImage) => Promise<string>`. Return a data URL for CSP-restricted pages or an OffscreenCanvas URL from a worker. |
| `revokeImage` | `URL.revokeObjectURL` for blob URLs | Releases what `encodeImage` returned. |
| `registry` | page-wide registry (16 idle maps kept warm) | A `MapRegistry` to share maps between handles. A private one is created when you pass a custom encoder. |
| `document` | `host.ownerDocument` | Element factory (`createElementNS`). |
| `onRender` | none | Called after every completed render. |

The handle is the `attachLiquidGlass` handle minus `target`, `mode`, `support`, `content`,
`appear`, `relayout`, `getStyle` and `getContentStyle`.

### Map registry

Handles whose geometry, optics and ratio agree share one map image through a reference-counted
registry; a list of identical cards costs one map. The page-wide `defaultMapRegistry` keeps the
16 most recently released maps warm so an unmount and remount, or a virtualised list, finds its
map again. Create your own with `new MapRegistry(revoke, { maxIdle })` and pass it as `registry`
when a group of handles should pool separately; `registry.clearIdle()` drops the warm maps,
`size` and `idleSize` report what it holds.

## 6. Parameters

All lengths are CSS px. Values are validated and clamped, never rejected, except for an unknown
`surface`, `blurKind`, `blurStage` or `dispersionUnit`, which throws a `TypeError`. The "map"
column marks parameters whose change regenerates the displacement map (CPU work, then a PNG
encode); everything else is an attribute write on the filter graph.

| Parameter | Type, default | Range | Map | Effect |
|---|---|---|---|---|
| `width`, `height` | number, 300 × 120 | ≥ 1 | yes | Effect size. Measured for you by `attachLiquidGlass`. |
| `radius` | number, 60 | 0 .. half the short side | yes | Corner radius of the lens shape. A square with `radius ≥ width/2` is a circle. |
| `bezelWidth` | number, 60 | 1 .. half the short side | yes | Width of the refracting rim. The flat center refracts nothing. |
| `surface` | `'convex_squircle'` | `convex_circle`, `convex_squircle`, `concave`, `lip` | yes | Height profile across the bezel. The squircle `(1−(1−x)⁴)^¼` is the reference profile; `concave` pulls inward; `lip` has a raised edge. |
| `refractiveIndex` | number, 1.5 | ≥ 1 | yes | Index of refraction (1.0 refracts nothing; glass is about 1.5; 1.7 to 2 looks like a thick lens). |
| `glassThickness` | number, 31.25 | ≥ 0 | yes | Thickness of the flat interior: a longer path inside the glass displaces more. Literal px (1.x applied a curve; 1.x `50` is `31.25`). |
| `displacementScale` | number, 180 | ≥ 0 | no | Maximum displacement in px. The map encodes the shape of the displacement; this sets the magnitude. |
| `physicalScale` | boolean, false | | no | Ignore `displacementScale` and use the maximum displacement the optics produce (`debug.physicalMaxDisplacementPx`), so IOR and thickness set the strength. |
| `dispersion` | number, 0 | 0..50 (`relative`), 0..64 (`px`) | no | Chromatic dispersion as three displacement passes (red, green, blue). 0 disables the stage. |
| `dispersionUnit` | `'relative'` | `relative`, `px` | no | `relative`: red and blue at `1 ∓ 0.02 × dispersion` times the green scale, so the fringe grows with the lens. `px`: red and blue `∓ dispersion` px from green, a fringe of fixed width. |
| `blurKind` | `'gauss'` | `gauss`, `noise1`, `noise2` | no | Gaussian blur, or a turbulence displacement for a textured, organic distortion (`noise1` coarse, `noise2` fine). |
| `blur` | number, 0.2 | ≥ 0 | no | Gaussian standard deviation in px, or the noise displacement scale (× 20 for `noise1`, × 40 for `noise2`). |
| `blurStage` | `'after'` | `after`, `before` | no | `after` blurs the refracted result; `before` blurs the backdrop first (alpha pinned opaque) and then displaces it, which keeps the rim and the dispersion fringe crisp. Indistinguishable at the default blur; visible from about 1 px, most with dispersion. Content mode always blurs first. |
| `specular` | boolean, true | | no | Rim highlight on or off. |
| `specularAngleDeg` | number, 60 | any | yes | Light direction in degrees (baked into the map's blue channel). |
| `specularStrength` | number, 0.81 | ≥ 0 | no | Rim brightness, applied once in the filter. Values above 1 are allowed and clip. |
| `shade` | number, 0 | 0..1 | no | Edge darkening: how dark the glass gets where the lens thins the backdrop the most, just inside the rim, fading to nothing on the flat center. Reads as thickness. 0.35 is a good start. |
| `tint` | number, 0.05 | 0..1 | no | Black overlay alpha, written as the target's `background-color`. |
| `saturation` | number, 1 | ≥ 0 | no | `saturate()` on the backdrop (in the filter graph in content mode). |

`resolveGlassParams(partial)` from `/core` returns the clamped set plus `shape` and `notes`
without touching the DOM, if you want to validate ahead of time. `fromLegacyParams()` maps 1.x
names (`scalePx`, `blurStdDev`, `showSpecular`, `frost`).

### What the map is

One RGBA image per unique geometry: R and G carry the inward displacement with a 128 bias, B
carries lighting signed around 128 (rim light above, shade below, both at unit strength so the
filter can scale them), A is 255 everywhere. `debug.mapUrl` shows it; the custom element's `debug`
attribute overlays it.

## 7. Browser support, fallback and the content-side lens

The backdrop lens needs `backdrop-filter` to accept an SVG filter with `feImage` and
`feDisplacementMap`. Verified against engine sources in November 2026 (WebCore
`RenderLayerBacking.cpp` and bug 245510, Mozilla bugs 1961378 and 1883933, WebKit bugs 322588 and
297770, WebCore `ImageBuffer.cpp`, the Safari 27.0 release notes):

| Engine | Backdrop lens | Content-side lens (`filter: url()`) |
|---|---|---|
| Chromium (Chrome, Edge, Opera, Brave, Android) | renders | renders (GPU) |
| WebKit (Safari and every iOS browser) through 27.2 | parses, renders nothing; the whole `backdrop-filter` list is dropped | renders (software path); `<video>` and WebGL canvases stay unfiltered; content above 4096 device px per side is downscaled; Safari < 27 needs a fresh filter id per update |
| Gecko (Firefox) through 159 | parses, renders nothing | renders on the CPU; keep the filtered element small |

`CSS.supports()` cannot tell the first column apart (support is defined at parse level), so
`detectGlassSupport()` is a parse check plus an engine check, like every library in the field.

```ts
import { detectGlassSupport, isLiquidGlassSupported, detectContentFilterSupport } from 'liquid-glass-filter';

detectGlassSupport();           // 'full' | 'frost' | 'none'
isLiquidGlassSupported();       // === 'full'
detectContentFilterSupport();   // true where filter: url() parses
```

Override detection for a page with `<html data-liquid-glass-support="force">` or `"off"`, or per
call with the `support` option.

### The frost fallback

With `fallback: 'frost'` (default) a non-Chromium engine gets `backdrop-filter: blur() saturate()`,
the tint, and a 1 px inset highlight when `specular` is on. No maps are generated, so it is cheap.
`fallback: 'none'` attaches the SVG filter anyway (useful on a page that already knows better).

### The content-side lens (experimental)

Where the backdrop lens cannot render, the same graph can be applied with plain `filter: url()`
to an element whose pixels you own, with the lens confined to a subregion at the glass's position.
This is the cross-engine route the 2026 libraries converged on.

```ts
const panel = document.querySelector('.panel')!;
const hero = document.querySelector('#hero')!;      // what sits behind the panel

const glass = attachLiquidGlass(panel, {
  content: hero,       // opt in
  // mode: 'auto'      // backdrop lens on Chromium, content lens elsewhere (default)
  // mode: 'content'   // content lens everywhere (useful to test it in Chrome)
});

glass.mode;            // 'content' on Safari / Firefox
// after you move the panel (drag, layout change that the observers cannot see):
await glass.relayout();
```

How it works and what to expect:

- The content element gets `filter: url(#id)`. The lens primitives are confined to the panel's
  rectangle inside the content's border box; the rest of the content passes through untouched
  (the source is cut out under the lens and the refracted lens composited over it).
- The panel keeps its tint and radius. The rim light, shade and saturation are painted by the
  filter.
- The lens follows size changes of both elements and capture-phase scroll events. A move of the
  panel by your own code needs `relayout()`, which rewrites four attributes and never touches the
  map. The motion module does not move the panel, so it needs nothing.
- One lens per content element: the filter is a property of that element. Two panels over the
  same content need two content elements.
- In Chrome the content lens matches the backdrop lens except a one-pixel anti-aliasing ring at
  the rounded edge and, with `blur` of 1 px or more, the rectangle corners outside the rounded
  shape, which carry the blur. Content mode always blurs before displacement (a blur after it
  would feather the lens rectangle and show the cut-out as an outline).
- Filter the smallest element that sits behind the glass, not the page: WebKit downscales
  filtered buffers above 4096 device px per side (the handle warns once through `warn`), Firefox
  filters on the CPU, and a transform on either element skews the measured offset.
- Not for an element that already carries `backdrop-filter` (WebKit ignores the `filter` then),
  and nothing filters `<video>` or WebGL canvases in Safari.
- Safari before 27 did not repaint a changed `filter: url()`. The handle detects it and gives the
  filter a fresh id per render (`bumpFilterId`); `handle.url` is live.

`applyStyles: false` works here too: put `getStyle()` on the panel and `getContentStyle()` on
the content element.

## 8. Motion

What makes glass read as liquid is motion: a spring that overshoots on release and a squash that
follows the pointer's velocity. The model is pure and lives in `liquid-glass-filter/motion`; the
browser glue is `attachGlassMotion` in the main entry.

```ts
import { attachLiquidGlass, attachGlassMotion } from 'liquid-glass-filter';

const glass = attachLiquidGlass(button);
const motion = attachGlassMotion(glass, {
  press: { scale: 1.045, dim: 0.85, spring: { duration: 0.35, bounce: 0.3 } }, // defaults
  drag: true,     // squash from pointer velocity while pressed
  hover: false,   // or true / { scale: 1.02, spring: { duration: 0.3, bounce: 0.15 } }
});
```

| Option | Default | Meaning |
|---|---|---|
| `press` | `true` | `boolean` or `{ scale, dim, spring }`. Scale up on pointer down and dim the lens to `dim` through `setIntensity`; spring back (with overshoot) on release. |
| `drag` | `true` | `boolean` or a partial `SquashConfig`: stretch along the pointer velocity, squash across it, shear with the horizontal component. Caps: 12 % stretch, 14° skew, full effect at 2000 px/s, decay 6/s. |
| `hover` | `false` | Lift on `pointerenter`. |
| `respectReducedMotion` | `true` | Under `prefers-reduced-motion` presses snap to their target and the squash is off. |
| `element` | the target (nothing in content mode) | Where the `transform` is written. `null` writes nothing; read `onFrame` or `handle.frame`. |
| `pointerTarget` | the target | Element whose pointer events drive press and drag. `null` for none: drive it yourself. |
| `onFrame` | none | Called every frame with `{ scaleX, scaleY, skewX, lift, intensity, transform }`. |
| `animationFrame`, `now`, `matchMedia` | globals | Test seams. |

| Handle member | Meaning |
|---|---|
| `press()`, `release()`, `hover(on)` | Drive the springs from your own events. |
| `impulse(vx, vy)` | Feed a velocity sample in px/s, for drag code that owns the pointer (or pointer capture). |
| `running` | True while the frame loop runs. It sleeps as soon as everything is at rest. |
| `pressed`, `frame` | Current state. |
| `destroy()` | Stop, remove listeners, restore the inline transform and the intensity. |

The transform is `scale(sx, sy) skewX(deg)` appended to any inline transform the element had,
and removed at rest, so an idle glass has no transform at all. Releasing a press mid-flight is
exact: springs are solved analytically from the current value and velocity, so nothing jumps.
In content mode the lens is painted by the content element and would not follow a transform on
the panel, so none is written unless you pass `element`.

The pure model, for your own loops or for a CSS transition:

```ts
import { springPhysics, stepSpring, isSpringAtRest, springLinearEasing, squashSample, squashDecay, squashDeformation } from 'liquid-glass-filter/motion';

const physics = springPhysics({ duration: 0.5, bounce: 0.3 });   // Apple's Spring(duration:bounce:)
let s = { value: 0, velocity: 0 };
s = stepSpring(s, 1, dtSeconds, physics);                        // exact for any dt
isSpringAtRest(s, 1);                                            // |Δ| < 1e-3 and |v| < 1e-2

const { easing, durationMs } = springLinearEasing({ duration: 0.5, bounce: 0.3 });
el.style.transition = `transform ${durationMs}ms ${easing}`;      // linear(0, 0.12, …, 1)
```

`springPhysics` also takes `{ mass, stiffness, damping }`; `springPerceptual` converts back.
`{ duration: 0.5, bounce: 0.3 }` is stiffness 157.9, damping 17.6, the pair Apple documents.

## 9. Custom elements

```ts
import { defineLiquidGlassElements } from 'liquid-glass-filter/elements';
defineLiquidGlassElements();                       // client only; idempotent; no-op on a server
// defineLiquidGlassElements({ prefix: 'lg', defaults: { shade: 0.35, dpr: 1 } });
```

```html
<liquid-glass-container radius="24" bezel-width="40" tint="0.05" shade="0.35" appear="400" motion
  style="width: 320px; height: 160px">
  Crisp content
</liquid-glass-container>
```

`<liquid-glass-container>` applies the effect to itself and follows its CSS size. Attributes are
the parameter names in kebab-case (`refractive-index`, `displacement-scale`, `dispersion-unit`,
`blur-stage`, …); the 1.x names `scale-px`, `blur-std-dev`, `show-specular` and `frost` still
work. Extra attributes:

| Attribute | Meaning |
|---|---|
| `width`, `height`, `radius` | Also set the inline size and radius. |
| `appear="400"` | Entrance on connect; `element.replayAppear()` plays it again. |
| `debug` | Overlay the displacement map. |
| `content="#selector"`, `mode="content"` | Content-side lens (section 7). The selector is resolved in the element's root (shadow or document) on connect. |
| `motion="press drag hover"` | Attach the motion with any subset; the bare attribute means press and drag. `element.motion` is the handle. |

Properties mirror the parameters in camelCase; `blur` is exposed as `blurAmount` because
`HTMLElement.blur()` exists. `element.glass` is the live `LiquidGlassHandle` (null while
disconnected). The element dispatches `liquid-glass:render` (non-bubbling, `detail.handle`) after
every render. Attribute and property changes in the same tick are coalesced into one update.

`<liquid-glass-filter filter-id="my-glass" width="320" height="160">` hosts only the SVG filter;
apply `backdrop-filter: url(#my-glass)` yourself and keep the size in step. `element.filter` is
the `GlassFilterHandle`, `element.url` the CSS reference.

Both classes extend `HTMLElement` only when one exists, so importing the entry in a server bundle
is safe. Registration happens only inside `defineLiquidGlassElements()`.

## 10. Frameworks and SSR

The handle API is framework-neutral: create in a mount effect, `update` on prop changes,
`destroy` on unmount.

React / Next.js (client component):

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
  useEffect(() => void glass.current?.update(params), [params]);
  return <div ref={ref} className="card">{children}</div>;
}
```

Vue 3:

```ts
const el = ref<HTMLElement>();
let glass: LiquidGlassHandle | undefined;
onMounted(() => (glass = attachLiquidGlass(el.value!, props)));
watch(() => ({ ...props }), (p) => glass?.update(p), { deep: true });
onBeforeUnmount(() => glass?.destroy());
```

Svelte 5 (action):

```ts
export function liquidGlass(node: HTMLElement, params: Partial<GlassParams>) {
  const glass = attachLiquidGlass(node, params);
  return { update: (p: Partial<GlassParams>) => void glass.update(p), destroy: () => glass.destroy() };
}
```

Styles owned by the framework: pass `applyStyles: false` and spread `glass.getStyle()` into the
element's style (and `getContentStyle()` into the content element's in content mode). Note the
values change after the first render and whenever tint, saturation or radius change; re-read them
in `onRender`.

Server rendering: import anywhere, call in the browser. For a static first paint, `/core` can
produce the filter markup on the server with a data-URL map (section 11), and the client can
attach over it later.

## 11. Engine only (`/core`)

Everything in `/core` is pure: numbers in, plain data out, no DOM types, runs in Node, workers and
tests.

```ts
import { resolveGlassParams, displacementCurve, displacementMap, maxAbs, buildFilterSpec, filterSpecToSvg } from 'liquid-glass-filter/core';

const p = resolveGlassParams({ width: 320, height: 160, radius: 24, bezelWidth: 40 });

// 1. the 1D refraction across the bezel (512 samples, px, index 0 = outer rim)
const curve = displacementCurve({
  glassThickness: p.glassThickness, bezelWidth: p.bezelWidth, refractiveIndex: p.refractiveIndex, surface: p.surface,
});

// 2. the map: { width, height, data: Uint8ClampedArray } at the given ratio
const map = displacementMap({
  width: p.width, height: p.height, radius: p.radius, bezelWidth: p.bezelWidth, dpr: 2,
  curve, maxDisplacement: maxAbs(curve),
  rim: { angleDeg: p.specularAngleDeg, rimPx: 2 },      // light and shade in the blue channel
});

// 3. the filter graph as data, then markup
const spec = buildFilterSpec(p, { id: 'glass', mapHref: pngDataUrlOf(map) });
const svg = filterSpecToSvg(spec);   // '<svg …><defs><filter id="glass" …>…</filter></defs></svg>'
```

| Function | Returns | Notes |
|---|---|---|
| `resolveGlassParams(partial, base?)` | `ResolvedGlassParams` | Clamped parameters plus `shape` and `notes`. |
| `displacementCurve(opts)` | `Float64Array` | Snell's law at each bezel sample over the bezel height plus glass thickness, with a soft-knee limiter. `surface` can be a name or your own `(x) => height` on [0, 1]. |
| `displacementMap(opts)` | `RGBAImage` | Band geometry at pixel centers, one quadrant computed and mirrored. `maxDisplacement` normalises the 8-bit range; the filter's `scale` restores px. |
| `maxAbs(curve)` | number | The physical maximum displacement, what `physicalScale` uses. |
| `specularMap(opts)` | `RGBAImage` | A standalone rim-light image, if you want it separate from the map. |
| `buildFilterSpec(params, { id, mapHref }, { padding?, region? })` | `FilterSpec` | The graph as `{ static, dynamic, structureKey }` primitives. `region` builds the content-side variant. |
| `filterSpecToSvg(spec)` | string | Inline `<svg>` markup; `mapHref` must then be a data or real URL. |
| `filterElementAttrs(spec)` | record | The `<filter>` element's attributes. |
| `createRGBAImage(w, h)` | `RGBAImage` | An empty buffer. |
| `fromLegacyParams(legacy)` | `Partial<GlassParams>` | 1.x name and value mapping. |

Encoding the buffer to a PNG is your job outside a browser (any PNG encoder works; the data is
straight RGBA, alpha 255). In a worker, `OffscreenCanvas` plus `convertToBlob()` does it, and the
resulting URL can be handed to the main thread's `createGlassFilter` through a custom
`encodeImage`.

## 12. Performance

What costs what:

| Action | Cost |
|---|---|
| First render, or a change to a map key (size, radius, bezel, surface, IOR, thickness, light angle, dpr) | CPU map generation for the bucketed size, capped by `maxMapPixels` (default about 565×565 device px, a few ms), then a PNG encode through a canvas (async). Shared across handles with the same key. |
| Any other parameter, `intensity`, `setLens`, `relayout` | Attribute writes on the existing primitives; the browser re-runs the filter on the next composite. |
| A resize | A new map for the new bucket, while the old one is stretched to the new box so nothing flickers. With `sizeBucket` 1.02, dragging a resize handle changes the bucket every 2 %, not every pixel. |
| Rendering | Chromium runs the backdrop filter in the compositor per frame; cost scales with the glass area and the number of passes (3× with dispersion, plus blur). Firefox content mode runs on the CPU. |

Guidance:

- Animate with `intensity`, `setLens`, CSS transforms, or the motion module. Do not animate map
  keys per frame.
- Let identical cards share maps: same size, radius, bezel and optics. `sizeBucket` already makes
  nearly identical sizes identical.
- Keep the page-wide registry; pass a private one only when a group should not share.
- Call `destroy()` when the element goes away. The map's URL is released once no handle holds it
  and the warm cache is full.
- Prefer a fixed `dpr` only when you know the display; otherwise ratio changes are tracked and
  regenerate the maps.
- In content mode, filter the smallest element behind the glass.

## 13. Accessibility

- `prefers-reduced-transparency` (Chromium): `reducedTransparency: 'auto'` makes the glass
  frostier and higher-contrast, Apple's Reduce Transparency contract. Drive it from your own
  setting with a boolean where the media query is unavailable.
- `prefers-reduced-motion`: the entrance is skipped and presses snap without overshoot; the drag
  squash is disabled.
- The hidden `<svg>` is `aria-hidden` and 0×0. Children of the glass are ordinary DOM: contrast
  is yours to check, since the backdrop shows through the tint.

## 14. Recipes

Starting points, in `attachLiquidGlass` option form. The playground (`npm run dev`) has six
presets and an A/B twin to compare two settings side by side.

```ts
// the playground's "Standard Glass": balanced refraction with a visible edge
{ surface: 'convex_squircle', radius: 60, bezelWidth: 60, glassThickness: 31.25, refractiveIndex: 1.5,
  displacementScale: 180, tint: 0.05, shade: 0.35, specularStrength: 0.81 }

// a quiet card: thin rim, little displacement, no fringe
{ bezelWidth: 24, displacementScale: 60, shade: 0.2, tint: 0.08, specularStrength: 0.5 }

// a thick lens: physical strength from a high index, chromatic fringe
{ surface: 'convex_circle', refractiveIndex: 1.7, glassThickness: 60, physicalScale: true,
  dispersion: 2, blurStage: 'before', shade: 0.5 }

// privacy glass: soft interior, strong tint, no highlight
{ blur: 2, blurStage: 'before', tint: 0.3, saturation: 1.2, specular: false, displacementScale: 90 }

// a fixed-width fringe that does not grow with a large glass
{ dispersion: 6, dispersionUnit: 'px' }
```

## 15. Troubleshooting

**Nothing refracts, only a blur.** You are in frost mode: `glass.mode === 'frost'` and
`data-liquid-glass="frost"`. That is every non-Chromium engine. Hand it the content behind the
glass (section 7) for real refraction there, or accept the frost.

**Nothing at all, including no blur.** `support === 'none'`: no `backdrop-filter`. Or the
element is 0×0 (check `glass.params.width`). Or a CSP blocks `blob:` images (console will say so).

**The lens is offset or clipped with `createGlassFilter`.** `width`/`height` must equal the
styled element's layout size; the filter region is that box.

**`url(#id)` does not resolve inside a shadow root.** Mount the `<svg>` in the same scope: pass
`mount` (the shadow root's host content) or let `attachLiquidGlass` mount inside the target.

**Two glasses render the same.** They share a map on purpose when geometry and optics agree.
That is expected and cheap; parameters outside the map keys still differ per handle.

**The map looks soft on a large glass.** The pixel budget lowered the generation ratio
(`debug.mapDpr` < `dpr`). Raise `maxMapPixels` if the rim needs more detail than 2 CSS px of
Gaussian can show at that ratio.

**Resizing feels heavy.** Check `debug.renders` and `debug.mapWidth`: with `sizeBucket: 1` every
pixel of width is a new map. Leave bucketing on.

**Content mode shows a faint rectangle around the glass.** Only with large blur values at the
rectangle corners outside the rounded shape; lower `blur` or accept it. An outline along the
whole rectangle would mean the content element also carries `backdrop-filter` (WebKit) or a
transform that skews the measured offset.

**Content mode double-draws text.** The content element is translucent and something else sits
under the lens: the hole cut from the source removes the content, not what is behind it. Give the
content element a background.

**Safari does not update after `update()` in content mode.** You passed `bumpFilterId: false` or a
UA without a version token. Leave the default.

**Next.js complains about `document`.** You called a function during server rendering. Import
anywhere, call in `useEffect` or a `'use client'` component; `defineLiquidGlassElements()` is a
no-op on the server.

**`element.blur` is a function.** The parameter is `blurAmount` on the elements.

## 16. Type index

Main entry: `LiquidGlassOptions`, `LiquidGlassHandle`, `GlassMode`, `GlassFallback`,
`AppearOptions`, `GlassFilterOptions`, `GlassFilterHandle`, `GlassFilterDebug`, `LensPlacement`,
`GlassMotionOptions`, `GlassMotionHandle`, `MotionFrame`, `MotionGlass`, `PressMotion`,
`HoverMotion`, `GlassSupport`, `SupportEnvironment`, `ImageEncoder`, `UrlRevoker`,
`MapRegistryOptions`, `ElementFactory`.

Core: `GlassParams`, `ResolvedGlassParams`, `BlurKind`, `BlurStage`, `DispersionUnit`,
`SurfaceKind`, `SurfaceFn`, `RGBAImage`, `DisplacementCurveOptions`, `DisplacementMapOptions`,
`SpecularMapOptions`, `FilterSpec`, `FilterPrimitive`, `FilterRefs`, `FilterSpecOptions`,
`LensRegion`, `LegacyGlassParams`.

Motion: `SpringPhysics`, `SpringPerceptual`, `SpringConfig`, `SpringState`, `RestThreshold`,
`LinearEasingOptions`, `SquashConfig`, `SquashState`, `Deformation`.

Elements: `LiquidGlassElement`, `LiquidGlassFilterElement`, `DefineLiquidGlassElementsOptions`,
`PropDef`, `PropType`; the `HTMLElementTagNameMap` augmentation types `document.createElement('liquid-glass-container')`.
