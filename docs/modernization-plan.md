# Liquid Glass UI: modernization audit and plan

Date: 2026-11-05. Scope: `src/core`, `src/components`, `tests/`, `demo/`, build and package config.

Target architecture (decided, not up for debate here):

- The published package is headless: `src/core` (engine) plus a small imperative API that attaches the effect to a caller-supplied element, exposes `update`/`destroy`, and owns no framework. Zero runtime dependencies. ESM, typed, tree-shakeable. Importable from React/Next, vanilla, anything.
- Web components survive only as a thin optional wrapper over that API. Lit is removed entirely; the wrapper is a hand-rolled `HTMLElement`.

Sections: status, 0 ground truth, 1 audit, 2 public API, 3 implementation plan, 4 open questions, 5 CLAUDE.md.

---

## Status (2026-11-05, end of day)

Executed on branch `modernize/headless`, one commit per step. All open questions were decided
per the recommendations in §4 (OQ-13: not on npm, so 2.0.0 with no deprecation path needed).

| Phase | State | Notes |
|---|---|---|
| 0 Lock behavior | done | 0.5 (benchmark gating) landed before 0.3/0.4 so the suite was green first. `@types/node` added as a dev type package for the fixture helpers. |
| 1 Purify core | done | Fixtures unchanged through 1.2. 1.5 drops the 1.x `bezel ≤ radius` and circle-only rules (OQ-14, extended to bezel). 1.6 picked 20/40 (OQ-9). |
| 2 Filter graph as data | done | Equivalence against the Lit-era graph was proven for all 12 structures before that code was deleted (commit "Phase 2.1 + 2.3"). |
| 3 Headless API | done | `createGlassFilter`, `attachLiquidGlass`, ESM-only package with `.`/`./core` entries. Demo dogfoods the API (3.6). |
| 4 Elements, Lit removal | done | `./elements` entry; lifecycle tests run under `happy-dom` (dev-only, the addition OQ-4 reserved). 4.3 landed early to fix a real break: `sideEffects:false` made Rollup drop the demo's side-effect-only imports, so the demo now has an explicit entry (`demo/main.ts`). `blur` is exposed as the `blurAmount` element property because `HTMLElement.blur()` exists. |
| 5 Research-dependent | done for the "clear win" items; the rest are decisions (below) | Driven by `docs/research-liquid-glass-2026.md` (its §5 ranks 14 items). Landed: item 1 real support detection + item 4(i) frost fallback + item 7 reduced transparency (5.1); item 2 three-pass dispersion + item 8 rim-in-blue-channel and region padding + item 6 `physicalScale` (5.3); item 3 quadrant-mirrored band walk + item 10 shared refcounted map registry (5.5). OQ-17 and OQ-18 were fixed on the way. Decision for 5.2 (renderer): stay SVG-only, handle remains renderer-neutral (research items 11, 14 are "not worth it now"). 5.4 (shapes) and 5.6 (vocabulary) are deferred/settled: see OQ-19 to OQ-23. |
| 6 Release | done except 6.3 (deferred) | README, CHANGELOG, 2.0.0. 6.2 bumped to TypeScript 6.0, Vite 8.3, Vitest 5.1, happy-dom 21, Node 22 in both workflows. TypeScript 7 (native compiler) and vite-plugin-dts 5 (rewrite over unplugin-dts, `rollupTypes` → `bundleTypes`) were tried and deliberately not taken yet. 6.3: a publish workflow was added and then deferred at the owner's request on 2026-11-06 (no npm publishing planned for now; the consumer imports the built package locally). The workflow lives in history (commit a2aa16d) if wanted later; the `package.json` metadata (repository, keywords, `publishConfig`, `prepublishOnly`) stayed. |

Visual check: done by the owner in a browser on 2026-11-05 after the Phase 5 rendering changes
("tested in browser and it works"). The branch was pushed as `feat/liquid-glass-2.0` (renamed from
`modernize/headless`) on 2026-11-06, not yet merged. The demo toolbar now shows which render path the
visiting browser got ("SVG lens" or "CSS frost fallback").

Considered and not done: throttling observer-driven resizes (hyalite rebuilds at most every 90 ms).
Unnecessary here because renders are serialized with newest-params-wins, so during a continuous
resize the regeneration rate is already bounded by encode latency, not by frame rate.

New findings while executing (added as OQ-17 and OQ-18 in §4):

- The band geometry's corner distance (`R - dist`) and straight-edge distance (`W-1-x`) differ by
  one pixel, so the right and bottom sides sit one pixel deeper in the band than the left and top.
  Measured: at the mid-height row of the default 300×120 shape the left rim pixel reads R=222 and
  the right R=3 instead of 34; the rim sample (u=0) also differs from its neighbour (222 vs 253),
  a one-pixel bright ring. Preserved and pinned; see `src/core/optics/band.ts`.
- The specular map flips the normal's y component in corner sectors only, so corner highlights do
  not match the adjacent straight edges (at 60°, a top-left corner reads ~0.26 alignment where
  the edges beside it read 0.87/0.5). Preserved and pinned; see `src/core/optics/specularLight.ts`.
- `specularStrength` is applied twice (clamped into the image and again as the `feFuncA` slope),
  so 0.9 renders as ~0.81. Preserved for parity.

---

## 0. Ground truth checked on 2026-11-05

Run on Windows 11, Node 22.19, npm 10.9, on a clean checkout of `main`, after `npm ci` (13 s, 179 packages; the `canvas` prebuilt binary installed without compiling here, which is not guaranteed on other platforms).

| Check | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` (what `npm run build` runs) | Passes. Covers `src/` only. |
| Typecheck of `tests/` and `demo/` | Not possible as configured: `include` is `["src"]` and there is no second project. |
| `vitest run` | **3 of 4 tests fail.** All three are ratio thresholds in `banding.spec.ts`: more samples did not cut flat-fraction (0.7765 at 1024 samples vs 0.7758 at 128); DPR 2 *raised* flat-fraction (0.776 → 0.887) where the test expected a 20 % drop; and the current optics have higher Laplacian energy than the original at equal parameters (0.718 vs 0.665) while winning on flat-fraction (0.776 vs 0.839). The README already says the tests are "not complete/tuned yet". |
| `vite build` (library) | Passes. Emits `liquid-glass.es.js` (39 kB), `liquid-glass.cjs.js` (31 kB), `index.d.ts`, with Lit externalized. |

Two conclusions. First, the repository has no passing automated check of core behavior today; the suite is a benchmark with aspirational thresholds, not a regression gate. Second, the benchmark numbers say something useful for the research session: flat-fraction is insensitive to the 1D sample count and rises with DPR, which points at 8-bit quantization of the displacement map as the banding floor, not the curve sampling. (`feDisplacementMap` reads 8 bits per channel; dithering or an alternative encoding would be the lever, see 5.3.)

Static facts confirmed by reading and diffing:

- `src/components/liquid-glass-container2.ts` is byte-identical to `liquid-glass-container.ts` and registers the same tag. Unreferenced.
- `src/core/images2.ts` is a stale copy of `images.ts` (its cache key omits `chromaticBezelFactor`). Unreferenced.
- `src/core/fx/driveRGBOffsets.ts` is unreferenced and targets element ids (`dispR/G/B`) that exist nowhere.
- `cache.maskKey/maskUrl/rimKey/rimUrl` are never touched outside their declaration; `cache.dispImg` is written, never read.
- `tests/banding.spec.ts` imports `./orig_displacement_funcs/displacementmap`; the file is `displacementMap.ts`. Resolves on Windows/macOS, fails on Linux.
- `canvas` (native Cairo binding) is a runtime `dependency` but is imported only by `tests/orig_displacement_funcs/displacementMap.ts`.
- `origin/js-lib` (Dec 2025) holds an earlier `packages/svg-filter-core` extraction with an `ImageDataLike` type. Same direction as this plan; nothing else to salvage.

---

## 1. Audit

### 1.1 `src/core`, file by file

**`defaults.ts`** (48 lines). `GlassContainerParams` type, default values, and three demo event-name constants.
Sound. This is the de-facto parameter schema and becomes the base of `GlassParams`. Dated: demo constants live in core (the author's own comment says they should move).

**`optics/surfaces.ts`** (53). Four bezel height profiles on [0,1] → [0,1] plus a registry and `asSurfaceKind`.
Pure and sound. `LIP` clamps `x*2` to 1 (a fix over the original in `tests/orig_displacement_funcs`). Nit: `asSurfaceKind` repeats the kind list instead of deriving it from `SURFACE_FNS`.

**`optics/disp1d.ts`** (63). Refracts a vertical ray at each sample of the bezel profile (Snell, via the GLSL `refract` formula) and projects it through the remaining glass to get a 1D horizontal displacement curve.
Pure and sound; the refraction math checks out against the standard formula. Notes to carry into tests, not to "fix" blindly:

- Samples are at `x = i/n`, covering [0,1). `disp2d` indexes the curve as if it spanned [0,1], so the inner edge is misaligned by half a sample. Harmless; lock with fixtures first.
- The `x < 1 ? 1e-4 : -1e-4` else-branch is dead (x never reaches 1). The TIR branch is dead for IOR > 1 (the ray enters the denser medium).
- The bezel's height scale is implicitly equal to `bezelWidth` (`y * bezelWidth`). There is no independent bezel-height parameter. Document as a modeling assumption.
- The soft-knee limiter and the `denom` guard are the deliberate deviations from the original; `banding.spec.ts` measures their effect (and shows they trade Laplacian energy for flat-fraction).
- Default parameter values are never used by callers.

**`optics/disp2d.ts`** (121). Rasterizes the 1D curve into a rounded-rectangle bezel band: R,G = displacement vector (128-biased), B = chromatic edge mask, A = 255 everywhere.
Sound. Issues:

- DOM leak: constructs `new ImageData` and falls back to `window.devicePixelRatio`. This is the only reason the test setup needs an `ImageData` polyfill.
- The rounded-rect/band geometry (`inRR`, corner/flat sector classification) is duplicated verbatim in `specularLight.ts`.
- Corner distance uses `R - dist`; flat edges use `W - 1 - x`. Half-pixel inconsistency; cosmetic.
- `chromaticBezelFactor` is an inverse fraction (4 means "outer 25 % of the bezel"). Misleading name.
- The map is normalized by `maximumDisplacement`, so physics only shapes the curve; `scalePx` sets the magnitude. "Physically shaped, artist scaled". Either document it or change it (OQ-10).
- O(W·H·DPR²) synchronous JS loop per rebuild. 300×120 at 2x is about 144k pixels (fine); 900×600 at 2x is about 2.2M (tens of ms, janky during drag-resize). Not broken; a worker is a later optimization (5.5).

**`optics/specularLight.ts`** (126). Grayscale rim highlight: Gaussian falloff from the outer edge, modulated by alignment of the outward normal with a light direction.
Sound; same geometry duplication. Notes:

- `ny = -cy/dist` here versus `+cy/dist` in `disp2d`: the y-axis convention is flipped for the light angle. Intentional but undocumented.
- The highlight is a `2px·DPR` rim with a hard cutoff at 3σ, not bezel-wide. `bezelWidth` only decides band membership.
- `strength` is clamped to [0,1] here and applied again as `feFuncA slope` in the filter. Above 1 only the slope acts, and changing strength regenerates the image for nothing.
- `|n·v|` makes the light symmetric: θ and θ+180° produce identical images.

**`validation/geometry.ts`** (108). Clamps radius and bezel, coerces a "circle-only" surface on rectangles, remaps thickness through a smoothstep, records notes.
Pure and sound. Questionable design:

- `kind = width === height ? 'circle' : 'rect'`. A 200×200 square with radius 20 is not a circle. It only feeds the circle-only rule, whose rationale is unclear since the 1D profile is shape-independent (OQ-14).
- `mapGlassThickness` is a UI feel curve baked into the engine: `glassThickness: 50` becomes 31.25 px in the optics. Surprising for a headless API (OQ-6).
- `notes` is a good debugging affordance. Keep it as structured output.

**`filters/core.ts`** (43). `el/append/clearDynamic/build` and the `Stage` type.
DOM-bound (`createElementNS`). Small and sound. The stage-composition idea is good; the DOM coupling is what to lift (stages should produce data, Phase 2).

**`filters/blur.ts`** (20). One `feGaussianBlur`. Sound.

**`filters/noiseBlur.ts`** (44). `feTurbulence` → `feColorMatrix` → `feDisplacementMap`.
Sound, with one bug: the build path sets `scale = stdDev*100`, while `FilterGraph.updateParams` sets `stdDev*20` (noise1) or `*40` (noise2). The first paint differs from the state after the first slider nudge (OQ-9). Fixed seed 7 is fine.

**`filters/chromatic.ts`** (96). 17 primitives: split channels, offset R and B, mask by the map's blue channel, recombine with `screen` (additive for disjoint channels, so correct), re-clip alpha.
Sound but heavy. Hidden contract: it reads the `map` result name that only exists in the host component's static template. The `Fast` suffix is a leftover from a removed slower path.

**`filters/specularFilter.ts`** (35). `feComponentTransfer(slope = gain)` over `specSrc`, then screen blend.
Sound. Same hidden contract on the `specSrc` result name.

**`fx/filterCache.ts`** (55). Module-level singleton cache plus `imageDataToBlobURL`.
The most serious problem in the codebase. One global cache is shared by every filter instance. With two instances whose parameters differ, each instance's update regenerates the maps and revokes the other instance's blob URL (`images.ts:50`). The multi-container demo exercises exactly this. Also: four unused fields; the `toDataURL` fallback for a missing `toBlob` is dated (universal since 2016); the key omits DPR, so a monitor change leaves a stale map.

**`images.ts`** (104). Orchestrates cache → map generation → sets `href` on `feImage`.
Not core at all: takes SVG elements and mutates the DOM. `v: any` is untyped; sample count 512 is hard-coded; the `xlink:href` dual-set is legacy (plain `href` is enough in every current browser).

**`images2.ts`**, **`fx/driveRGBOffsets.ts`**: dead. Delete.

Verdict: the math (`surfaces`, `disp1d`, `disp2d`, `specularLight`, `geometry`) is sound and is the real asset. The `fx` and `images` layer is where the defects live (global state, DOM in core, duplication). Dated patterns: `filterRes`, `xlink:href`, `toDataURL` fallback, `any`.

### 1.2 `src/components`, file by file

**`filterGraph.ts`** (110). Splits "structure" (which stages exist; rebuilt only when `dispersion>0 / blurKind / showSpecular` change) from "parameters" (attributes poked in place).
Good design; keep the idea. Issues: it takes a `LitElement` only to reach `renderRoot`; the noise scale mismatch above; `getAttribute('stdDeviation') !== String(blurStdDev)` compares `"0.20"` with `"0.2"` so it always re-sets (harmless); `scale_px` naming.

**`liquid-glass-filter.ts`** (181). The real component. Owns `<svg><defs><filter>` with three static primitives (map `feImage`, `feDisplacementMap`, specular `feImage`) and rebuilds maps and graph on every property change.
Issues:

- `updated()` calls the async `_updateFilter()` on every change with no coalescing and no latest-wins guard. Overlapping runs race on the shared cache and can apply out of order.
- `filterRes` was removed in SVG 2 and is ignored by every browser. Dead attribute.
- `frost` and `saturation` are declared here but unused (they belong to the container). `radius` is only used for validation.
- The `<svg>` is `position:absolute` at the full `width×height` just to host `<defs>`. It should be 0×0.
- `ensureFilterId` runs from the constructor, `connectedCallback`, and `willUpdate`: three paths for one id.
- The map URL is exposed via a bubbling `displacement-updated` event (debug only). Maps onto a callback in the new API.
- The filter region is `userSpaceOnUse` at `0 0 width height`, which under `backdrop-filter` is the target's border box. That is why width/height must track the element exactly, and why the new API needs a size source (ResizeObserver or explicit).

**`liquid-glass-container.ts`** (122). Light-DOM wrapper: a sized `div`, a child `<liquid-glass-filter>` fed 15 properties, and an overlay `div` with `backdrop-filter: url(#id) saturate()` plus a black tint.
Issues:

- Pure prop-plumbing boilerplate, re-run on every render.
- `resolveFilterId` runs in four places, including `render()`.
- Size comes from props, not from layout. It cannot be responsive.
- The overlay sits above the host's content, so any children of the container are refracted too. The `backdrop-filter` should be on the host itself; children then paint crisp above the glass.
- Inline styles everywhere.

**`liquid-glass-container2.ts`**: identical duplicate registering the same tag (importing both would throw `NotSupportedError`). Delete.

**`src/index.ts`**: importing the package runs `customElements.define` (through Lit's decorators). The entry is side-effectful, so `sideEffects: false` is impossible and bundlers cannot tree-shake it, and there is no element-free import path to the engine. Lit's Node build keeps the import from throwing on a server, but a hand-rolled wrapper will not have that safety net, so the elements must live behind a separate, explicitly client-side entry (Phase 4).

### 1.3 Every use of Lit, classified

| File | Lit feature | Class | Replacement |
|---|---|---|---|
| `liquid-glass-filter.ts` | `LitElement` base; `connectedCallback`, `firstUpdated`, `updated` | **load-bearing** (lifecycle + update scheduling) | `HTMLElement` + a microtask-coalesced `scheduleUpdate()` (~20 lines) |
| | `@property` ×17 (attribute↔property, Number/Boolean coercion, batched change) | **load-bearing** (reactivity) | one shared `defineReactiveProps(Ctor, schema)` helper (~40 lines), used by both wrappers |
| | `@customElement` | incidental | `customElements.define` inside `defineLiquidGlassElements()` |
| | `@query` ×4 | incidental | `querySelector` |
| | `html` template in `render()` | **load-bearing but static** (only id/width/height vary) | one `innerHTML` at connect, three `setAttribute`s on update |
| | `willUpdate` / `PropertyValues` | incidental (only re-resolves filterId) | drop |
| `liquid-glass-container.ts` | `LitElement` lifecycle | **load-bearing** | `HTMLElement` lifecycle |
| | `@property` ×19 | **load-bearing** (reactivity) | same helper |
| | `@state` (`_debugMapUrl`) | incidental | plain field |
| | `html` with `.prop=${}` / `@event=${}` bindings | **load-bearing today** (prop plumbing on each render) | disappears: the wrapper calls `handle.update(patch)` |
| | `willUpdate` | incidental | drop |
| `filterGraph.ts` | `import type { LitElement }` (for `renderRoot`) | incidental | `ParentNode` |
| `demo/ui/workbenchPatterns.ts` | `LitElement`, `css`, `html`, `@customElement`; static content, no reactivity | incidental | ~60 lines of HTML + CSS in `demo/index.html` / `demoPage.css` |
| `tsconfig.json` | `experimentalDecorators`, `useDefineForClassFields: false` | incidental (exist only for Lit decorators) | delete both |
| `package.json`, `vite.config.ts` | `lit` peer + dev dependency; `external: ['lit']`, `globals.lit` | incidental | delete |

Bottom line: the load-bearing Lit is the reactive property schema and the update lifecycle. Both are replaced by one helper of roughly 60 lines. Templating is two small static templates. Expected wrapper rewrite: about 250 lines, no new dependencies. The rewrite is cheap; the headless API is the real work.

### 1.4 Build, package, tests, CI

- `canvas` ^3.2.0 in `dependencies`: every consumer downloads or compiles a native Cairo binding to install a browser library. Used only by the test baseline. Remove (replace `createImageData` with a three-line plain-object factory).
- `exports["."]` lists `types` last. TypeScript matches conditions in order; under `moduleResolution: bundler` the `import` condition wins and TS looks for `liquid-glass.es.d.ts`, which `rollupTypes` does not emit (it emits `index.d.ts`). Consumers on modern TS configs likely get no types. `types` must come first.
- No `sideEffects` field, and the entry is side-effectful anyway.
- A CJS build is unnecessary for a browser-only ESM library; Node 22 `require()`s ESM natively (OQ-2).
- `tsconfig.json`: `moduleResolution: node` (node10) is obsolete for a Vite/ESM project; `bundler` matches `allowImportingTsExtensions`. `include: ["src"]` means tests and demo are never typechecked. `lib: ["DOM"]` everywhere means nothing enforces that core is DOM-free.
- `npm test` runs `vitest` (watch mode). CI needs `vitest run`.
- Coverage reality: `banding.spec.ts` is a benchmark (console tables plus ratio assertions comparing new versus original displacement) and it fails on `main`. There are zero tests for surfaces, `validate()`, the specular image, the chromatic mask channel, the filter graph, the cache, or the components. "Lock down core" means all of that gets fixture and invariant tests (Phase 0).
- `tests/setup.ts` polyfills `ImageData` only because core constructs DOM `ImageData`. It also declares an unused global `ImageDataLike`.
- CI: `deploy.yml` builds the demo on push to main. No test or typecheck job. Node 20 in CI, 22 locally.
- Tooling is one major behind on each axis (Vite 5, Vitest 2, TS 5.6). Same tools; bump last (6.2).
- README oversells: "Framework agnostic" ignores the side-effectful entry; "Tiny core, no DOM/Lit dependencies" is false for `images.ts`, `filterCache.ts`, and `filters/*`.

### 1.5 Defects ranked (behavior, not style)

1. Global map cache shared across instances → blob URL revocation thrash with two or more differently configured instances. (`filterCache.ts`, `images.ts`)
2. Side-effectful entry: no tree-shaking, no element-free path to the engine. (`index.ts`)
3. `canvas` as a runtime dependency. (`package.json`)
4. `types` export condition order. (`package.json`)
5. Unguarded concurrent `_updateFilter` runs. (`liquid-glass-filter.ts`)
6. noiseBlur initial versus updated scale mismatch (100 versus 20/40).
7. Import path case bug in `banding.spec.ts` (Linux CI failure).
8. `backdrop-filter` on an overlay above content instead of on the host.
9. Cache keys ignore DPR.
10. Dead code and attributes: `filterRes`, `xlink:href`, `container2`, `images2`, `driveRGBOffsets`, unused cache fields, unused `frost`/`saturation` on the filter element.

---

## 2. Proposed public API

### 2.1 Layering and entry points

```
src/core/       pure TypeScript. No DOM types, no globals. Typechecked with lib: ["ES2022"] (no DOM).
src/dom/        browser-only, framework-free. Imports core. Touches document/canvas/URL/ResizeObserver
                only inside function bodies, never at module evaluation.
src/elements/   hand-rolled custom elements. Imports dom. Separate entry. Registers nothing on import.
demo/           playground. Imports anything. Never imported by src/.
```

```jsonc
// package.json (target)
"type": "module",
"sideEffects": false,
"exports": {
  ".":          { "types": "./dist/index.d.ts",    "import": "./dist/index.js" },
  "./core":     { "types": "./dist/core.d.ts",     "import": "./dist/core.js" },
  "./elements": { "types": "./dist/elements.d.ts", "import": "./dist/elements.js" }
},
"dependencies": {},            // must stay empty
"peerDependencies": {}         // must stay empty
```

### 2.2 Core (`liquid-glass-filter/core`, re-exported from `.`)

```ts
export type SurfaceKind = 'convex_circle' | 'convex_squircle' | 'concave' | 'lip';
export type BlurKind = 'gauss' | 'noise1' | 'noise2';
/** Bezel height profile on [0,1] → [0,1]; 0 is the outer rim, 1 the inner edge. */
export type SurfaceFn = (x: number) => number;

export interface GlassParams {
  // geometry, CSS px
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  // optics
  surface: SurfaceKind;
  refractiveIndex: number;
  glassThickness: number;          // CSS px, literal (OQ-6)
  displacementScale: number;       // max displacement in px            (was scalePx)
  chromaticBezelFraction: number;  // 0..1, outer share of the bezel that disperses (was 1/chromaticBezelFactor)
  dispersion: number;              // 0 disables the chromatic stage
  // look
  blurKind: BlurKind;
  blur: number;                    //                                    (was blurStdDev)
  specular: boolean;               //                                    (was showSpecular)
  specularAngleDeg: number;
  specularStrength: number;
  tint: number;                    // 0..1 black tint alpha              (was frost)
  saturation: number;
}
export const DEFAULT_GLASS_PARAMS: Readonly<GlassParams>;

export interface ResolvedGlassParams extends GlassParams {
  shape: 'circle' | 'rect';
  notes: readonly string[];        // what was clamped or coerced, and why
}
/** Merge with defaults, clamp, coerce. Pure. Throws only on an unknown surface or blurKind. */
export function resolveGlassParams(input: Partial<GlassParams>, base?: GlassParams): ResolvedGlassParams;

/** Plain pixel buffer. The DOM layer wraps it in ImageData; tests need no polyfill. */
export interface RGBAImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;   // width * height * 4
}

export const SURFACES: Readonly<Record<SurfaceKind, { title: string; fn: SurfaceFn }>>;

export function displacementCurve(opts: {
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  surface: SurfaceKind | SurfaceFn;
  samples?: number;                 // default 512
}): Float64Array;

export function displacementMap(opts: {
  width: number; height: number; radius: number; bezelWidth: number;
  dpr: number;                      // required; core never reads window
  curve: ArrayLike<number>;
  chromaticBezelFraction: number;
}): RGBAImage;

export function specularMap(opts: {
  width: number; height: number; radius: number; bezelWidth: number;
  dpr: number;
  angleDeg: number;
  strength: number;
  rimPx?: number;                   // default 2
}): RGBAImage;

/** Pure description of the SVG filter. Materialized by the DOM layer or serialized for SSR. */
export interface FilterPrimitive {
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children?: readonly FilterPrimitive[];
}
export interface FilterSpec {
  id: string;
  width: number;
  height: number;
  static: readonly FilterPrimitive[];    // feImage(map), feDisplacementMap, feImage(specSrc)
  dynamic: readonly FilterPrimitive[];   // chromatic → blur → specular, in order
  structureKey: string;                  // changed ⇒ rebuild dynamic nodes; same ⇒ only attributes change
}
export function buildFilterSpec(
  p: ResolvedGlassParams,
  refs: { id: string; mapHref: string; specularHref: string },
): FilterSpec;
export function filterSpecToSvg(spec: FilterSpec): string;   // '<svg …><defs><filter id=…>…</filter></defs></svg>'
```

### 2.3 DOM layer (`liquid-glass-filter`, main entry)

```ts
export interface GlassFilterOptions extends Partial<GlassParams> {
  id?: string;            // default: auto-generated 'lg-<n>'
  mount?: Element;        // where the hidden 0×0 <svg> goes. Default: appended inside `host`, which keeps it in
                          // the same tree scope so url(#id) resolves even when the host is inside a shadow root.
  dpr?: number;           // default: window.devicePixelRatio, tracked through matchMedia('(resolution)')
  encodeImage?: (img: RGBAImage) => Promise<string>;   // default: canvas → PNG blob URL. Seam for tests and workers.
}

export interface GlassFilterHandle {
  readonly id: string;
  readonly url: string;                    // 'url(#lg-1)': paste into backdrop-filter or filter
  readonly filterElement: SVGFilterElement;
  readonly params: Readonly<ResolvedGlassParams>;
  /** Coalesced per microtask, latest wins. Resolves once the DOM reflects the patch. */
  update(patch: Partial<GlassParams>): Promise<void>;
  /** Revokes blob URLs, removes the <svg>, disconnects observers. Idempotent. */
  destroy(): void;
  readonly debug: {
    displacementMapUrl: string | null;
    specularMapUrl: string | null;
    physicalMaxDisplacementPx: number;     // OQ-10
  };
}
export function createGlassFilter(host: Element, options?: GlassFilterOptions): GlassFilterHandle;

export interface LiquidGlassOptions extends GlassFilterOptions {
  size?: 'observe' | { width: number; height: number };  // default 'observe': ResizeObserver on target
  radius?: number | 'css';     // 'css' reads the computed border-radius (px values only). Default 'css'.
  applyStyles?: boolean;       // default true: sets backdrop-filter, -webkit-backdrop-filter, background, border-radius on target
  onRender?: (handle: LiquidGlassHandle) => void;
}
export interface LiquidGlassHandle extends GlassFilterHandle {
  readonly target: HTMLElement;
  /** For applyStyles:false or React style={}. Keys: backdropFilter, WebkitBackdropFilter, background, borderRadius. */
  getStyle(): Readonly<Record<string, string>>;
}
export function attachLiquidGlass(target: HTMLElement, options?: LiquidGlassOptions): LiquidGlassHandle;

/** Feature detection. [RESEARCH] the probe is TBD; CSS.supports() is not reliable for url() in backdrop-filter. */
export function isLiquidGlassSupported(): boolean;
```

Module-evaluation safety: nothing in `src/dom` touches `document` or `window` at import time. `import { attachLiquidGlass } from 'liquid-glass-filter'` is safe in a Next.js module as long as the call happens in an effect.

### 2.4 Elements (`liquid-glass-filter/elements`)

```ts
export class LiquidGlassElement extends HTMLElement {           // <liquid-glass-container>
  static readonly observedAttributes: readonly string[];       // kebab-case of each GlassParams key, plus 'debug'
  readonly glass: LiquidGlassHandle | null;                    // null until connected
  // typed accessors generated from the schema: width, height, radius, …, debug
}
export class LiquidGlassFilterElement extends HTMLElement {     // <liquid-glass-filter filter-id="…">
  static readonly observedAttributes: readonly string[];
  readonly filter: GlassFilterHandle | null;
  get filterId(): string;
}
/** Idempotent. Default tag names match today's. No-op when customElements is undefined (server). */
export function defineLiquidGlassElements(opts?: { prefix?: string }): void;
```

The class declarations must not evaluate `extends HTMLElement` on a server. Use `const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement` or define the classes lazily inside `defineLiquidGlassElements()`.

### 2.5 How the four current components map

| Today | After |
|---|---|
| `<liquid-glass-filter>` (owns svg, filter, maps, graph) | `createGlassFilter(host, opts)` → `GlassFilterHandle`. Wrapper `LiquidGlassFilterElement`: connected → create, attributeChanged → `update`, disconnected → `destroy`. |
| `<liquid-glass-container>` (sized box + child filter + overlay) | `attachLiquidGlass(target, opts)`. Wrapper `LiquidGlassElement` attaches to itself. The overlay `div` disappears (styles go on the host). `debug` becomes `handle.debug.displacementMapUrl`, painted by the wrapper or demo. |
| `FilterGraph` | `core/filters/spec.ts` (`buildFilterSpec`, pure) + `dom/mountFilter.ts` (materialize, diff by `structureKey`). |
| `liquid-glass-container2` | Deleted. |
| `images.ts` + `filterCache.ts` | `dom/mapCache.ts`: per-handle `{ key → url }`, revoke on replace, revoke all on destroy. |
| `displacement-updated` event | `onRender` callback and `handle.debug`. |

Usage:

```ts
// vanilla
import { attachLiquidGlass } from 'liquid-glass-filter';
const glass = attachLiquidGlass(document.querySelector('.card')!, { refractiveIndex: 1.5, tint: 0.05 });
await glass.update({ dispersion: 1.2 });
glass.destroy();

// React / Next (client component)
useEffect(() => {
  const g = attachLiquidGlass(ref.current!, opts);
  glassRef.current = g;
  return () => g.destroy();
}, []);
useEffect(() => { void glassRef.current?.update(opts); }, [opts]);

// HTML
import { defineLiquidGlassElements } from 'liquid-glass-filter/elements';
defineLiquidGlassElements();
// <liquid-glass-container refractive-index="1.5" tint="0.05">…</liquid-glass-container>
```

---

## 3. Implementation plan

Rules: Phase 0 lands before any step edits core math. Every behavior-changing step updates fixtures in its own commit and says so. `[RESEARCH]` steps wait for the parallel survey of current liquid-glass implementations; do not guess their content.

### Phase 0: lock behavior (no changes to math)

| Step | What | Done when |
|---|---|---|
| 0.1 | Add `CLAUDE.md` (§5). Scripts: `test` = `vitest run`, `test:watch` = `vitest`, `typecheck` = `tsc -p tsconfig.json`. | `npm test` exits instead of watching. |
| 0.2 | Make the suite run everywhere. Fix the import case in `banding.spec.ts`. Replace `canvas`'s `createImageData` in the baseline with a plain-object factory. Remove `canvas` from `package.json`. Add `tsconfig.test.json` so tests and demo typecheck. Add `.github/workflows/ci.yml` (Node 22, push and PR: `npm ci`, `typecheck`, `test`). | CI green on Linux (with 0.5 applied, since the benchmark fails today). |
| 0.3 | Fixture and invariant tests for pure core in `tests/core/`. **surfaces**: values at x ∈ {0, .25, .5, .75, 1} per kind; `asSurfaceKind` fallback. **disp1d**: fixtures per surface × IOR {1.0, 1.5, 2.2} × two thickness/bezel pairs at 64 samples (tolerance 1e-9); invariants: IOR 1.0 ⇒ all zeros, all finite. **disp2d**: fixtures for 300×120 r60 b60 at dpr 1 and 2, and 200×200 r100 b100 at dpr 1, sampled on a 24×24 grid, tolerance ±1 per channel; invariants: center pixel (128,128,0,255), outside-corner pixel neutral, left/right and top/bottom mirror symmetry within ±1, B>0 only where u < 1/factor, A=255 everywhere. **specularLight**: same geometries at 60°; invariants: zero beyond 3·rim, θ ≡ θ+180°. **geometry**: table for radius clamp, bezel clamp, circle-only coercion, thickness mapping 0/50/100/200 → 0/31.25/100/200, note text. Fixtures are JSON under `tests/fixtures/`, regenerated only by an explicit `UPDATE_FIXTURES=1` run. | Every exported function in `src/core/optics` and `src/core/validation` has a fixture test and an invariant test. |
| 0.4 | Characterize the filter graph before touching it. `tests/fakeDom.ts` (~40 lines): `createElementNS` returning objects with `attrs`, `children`, `setAttribute`, `getAttribute`, `appendChild`, `remove`, `querySelector(All)` for tag names and `[data-dyn]`/`[data-role]`. Snapshot `FilterGraph.buildIfNeeded` output (tag + attrs) for all 2×3×2 structural combinations and the attribute effects of `updateParams`. | Snapshots committed. (Alternative: `happy-dom`, OQ-4.) |
| 0.5 | Turn `banding.spec.ts` into a benchmark: move to `tests/bench/`, run only with `BENCH=1`, and downgrade its three failing threshold assertions to reported numbers. It measures a trade-off (flat-fraction versus Laplacian energy), not a regression. | Default `npm test` is fast, deterministic, and green. |

### Phase 1: purify core (behavior-preserving; Phase 0 fixtures must not change)

| Step | What |
|---|---|
| 1.1 | Delete dead code: `liquid-glass-container2.ts`, `images2.ts`, `driveRGBOffsets.ts`, unused cache fields, `filterRes`, unused `frost`/`saturation` on the filter element, `xlink` dual-set. |
| 1.2 | `RGBAImage` replaces `ImageData` in `disp2d` and `specularLight`; `dpr` becomes a required parameter (no `window` fallback in core). Delete the `ImageData` polyfill from `tests/setup.ts`. Extract `roundedRectBand()` shared by both; fixtures prove identical output. |
| 1.3 | Add `tsconfig.core.json` (`include: ["src/core"]`, `lib: ["ES2022"]`, no DOM) and `typecheck:core`. This is the mechanical enforcement of "no DOM in core". |
| 1.4 | Move the demo event constants to `demo/ui/events.ts`. |
| 1.5 | Introduce `GlassParams` and `resolveGlassParams` in core with the §2 names, plus an adapter from the old names so the Lit components keep working until Phase 4. (If OQ-5 is "keep names", this step is just `resolveGlassParams`.) |
| 1.6 | Fix the noiseBlur scale mismatch with the value from OQ-9. Intended visual change: update the 0.4 snapshot in its own commit. |

### Phase 2: filter graph as data

| Step | What |
|---|---|
| 2.1 | `core/filters/spec.ts`: port blur, noiseBlur, chromatic, and specular stages to return `FilterPrimitive[]`; `buildFilterSpec` adds the static primitives and `structureKey`. Tests: spec output must equal the 0.4 snapshots modulo the data→DOM mapping (write that comparison once). |
| 2.2 | `dom/mountFilter.ts`: materialize a spec into an `SVGFilterElement`; on update, if `structureKey` changed replace the dynamic nodes, else set only changed attributes. Delete `filters/core.ts` DOM helpers and `FilterGraph`. |
| 2.3 | `filterSpecToSvg` (string). Cheap now; enables SSR of the static filter later (OQ-11). |

### Phase 3: headless API

| Step | What |
|---|---|
| 3.1 | `dom/mapCache.ts` (per handle) and `dom/encodeImage.ts` (`RGBAImage` → PNG blob URL; `toBlob` only). |
| 3.2 | `dom/createGlassFilter.ts`: owns svg and filter, maps, mount, id; coalesced latest-wins `update()`; `destroy()`. DPR in cache keys; `matchMedia('(resolution)')` change listener. |
| 3.3 | `dom/attachLiquidGlass.ts`: ResizeObserver (rAF-throttled), computed border-radius, `applyStyles`, `getStyle()`. |
| 3.4 | New side-effect-free `src/index.ts` and `src/core/index.ts`; `package.json` exports with `types` first, `sideEffects: false`, drop `lit` and the CJS output (OQ-2); Vite lib config with three entries. |
| 3.5 | Tests: update coalescing, cache keying, destroy cleanup, using an injected `encodeImage` and a fake `ResizeObserver`. DOM via the 0.4 fake or `happy-dom` (OQ-4). |
| 3.6 | Demo stage switches to `attachLiquidGlass` directly; the config pane drives `handle.update`. This is the first real consumer of the API and will shake out ergonomics before the wrapper is written. |

### Phase 4: wrapper elements and Lit removal

| Step | What |
|---|---|
| 4.1 | `elements/reactiveProps.ts` (schema → `observedAttributes`, typed accessors, coalesced change callback). `elements/LiquidGlassElement.ts`, `elements/LiquidGlassFilterElement.ts`, `defineLiquidGlassElements()`. Server-safe base class (§2.4). |
| 4.2 | Delete `src/components/`, `lit` from `package.json`, `experimentalDecorators` and `useDefineForClassFields` from `tsconfig.json`; switch to `moduleResolution: bundler`. |
| 4.3 | Demo: replace `<workbench-patterns>` with static HTML and CSS; keep one `<liquid-glass-container>` on the page so the elements entry is exercised. |
| 4.4 | Wrapper tests: attribute → `update`, disconnect → `destroy`, re-connect → re-attach. |

### Phase 5: research-dependent placeholders (do not fill in by guessing)

| Step | Waits on the survey for | Lands as |
|---|---|---|
| 5.1 `[RESEARCH]` Browser support and fallback | Current status of `backdrop-filter: url(#svg)` in WebKit and Firefox; `feDisplacementMap` + `feImage` quirks; what the field ships as a fallback (plain `blur()`, CSS-only approximations, nothing). | `isLiquidGlassSupported()` implementation and a `fallback` option on `LiquidGlassOptions`. |
| 5.2 `[RESEARCH]` Renderer strategy | Whether reference implementations stay SVG-filter-only or render through canvas/WebGL, and what that buys (Safari, performance, per-pixel lighting). | Either nothing, or `attachLiquidGlass(canvas, { renderer: 'webgl' })` behind the same handle. The §2 handle shape is renderer-neutral on purpose. |
| 5.3 `[RESEARCH]` Optics and lighting upgrades | Candidates the survey may surface: true dispersion via three displacement scales instead of channel offsets; bezel-wide specular with a light direction; shadow and edge-light layers; dithering or alternative encodings against the 8-bit banding floor measured in §0. | Additive `GlassParams` fields, never renames. Each gets a fixture before it ships. |
| 5.4 `[RESEARCH]` Shape generalization | Per-corner radii, SDF or path shapes. | A geometry input type on `displacementMap`/`specularMap`; gated because it changes signatures. |
| 5.5 `[RESEARCH-informed]` Performance | Whether reference implementations move map generation off the main thread for interactive resize. | Worker/OffscreenCanvas behind the existing `encodeImage` seam plus a `generateMaps` seam. |
| 5.6 `[RESEARCH]` Vocabulary | Whether a de-facto parameter vocabulary exists in the field. | Only if it does, rename at 2.0 (one shot) instead of §2 names. Otherwise §2 names stand. |

### Phase 6: release

| Step | What |
|---|---|
| 6.1 | README rewrite (three usage modes), CHANGELOG with the 1.x → 2.0 parameter mapping table, `version: 2.0.0`. |
| 6.2 | Dependency bumps within the same tools (Vite, Vitest, TypeScript), Node 22 in workflows. Separate commit, after everything else, tests green before and after. |
| 6.3 | Optional: publish workflow on tag. |

Dependencies: 0 → 1 → 2 → 3 → 4 → 6. Phase 5 items slot in after 3 (5.1, 5.2, 5.5) or after 2 (5.3, 5.4, 5.6). Nothing in 1–5 starts before 0 is merged.

---

## 4. Open questions for you, with a recommendation for each

| # | Question | Recommendation |
|---|---|---|
| OQ-1 | Web components: separate entry (`./elements`) or demo-only? | Separate entry. About 250 lines, keeps README "Option A" users working, and the demo needs it anyway. |
| OQ-2 | Drop the CJS build? | Yes. ESM-only. Node 22+ `require()`s ESM natively; fewer artifacts, no dual-package hazard. |
| OQ-3 | `canvas`: devDependency or gone? | Gone. The baseline only needs a plain `{ width, height, data }` object. |
| OQ-4 | DOM in tests: hand-rolled fake or `happy-dom` (dev-only)? | Fake element for Phases 0–2 (40 lines, zero deps). Add `happy-dom` as a devDependency at 3.5/4.4 if the fake grows past ~100 lines; Vitest supports it natively and it is test infrastructure, not a shipped dependency. Neither happy-dom nor jsdom implements canvas 2D or ResizeObserver, so those stay injected seams regardless. |
| OQ-5 | Rename parameters at 2.0 (`scalePx`→`displacementScale`, `blurStdDev`→`blur`, `showSpecular`→`specular`, `frost`→`tint`, `chromaticBezelFactor`→`chromaticBezelFraction`)? | Yes. It is a breaking release anyway and the current names mislead (`frost` is a tint, the factor is an inverse fraction). Ship a mapping table and keep the old attribute names as aliases on the elements for one major. Hold until 5.6 reports if you want the survey's vocabulary first. |
| OQ-6 | Keep the smoothstep thickness curve inside the engine? | No. The API takes literal px. Convert the six presets to their effective values once (50 → 31.25 and so on) so the demo looks identical; the demo slider can keep the curve if you like the feel. |
| OQ-7 | Should `attachLiquidGlass` apply styles to the target by default? | Yes (zero-config), with `applyStyles: false` plus `getStyle()` for React `style={}` users. |
| OQ-8 | Where does the hidden `<svg>` mount by default? | Inside the target (same tree scope, works in shadow DOM), `mount` to override. React users whose target's children are React-managed should pass `mount`. |
| OQ-9 | noiseBlur scale: 100× (initial build) or 20×/40× (update path)? | 20/40. The presets were almost certainly tuned by dragging sliders, which is the update path. Verify visually in the demo before committing the snapshot change. |
| OQ-10 | Displacement magnitude: keep `displacementScale` as "max px" (current) or use the physical maximum? | Keep the artist scale; expose `physicalMaxDisplacementPx` in `debug` so the research session can compare against physically scaled implementations. |
| OQ-11 | SSR static markup (`filterSpecToSvg`): public in 2.0 or later? | Later. Add it internally in Phase 2 (it is nearly free) but do not document it until a Next.js example proves it useful. |
| OQ-12 | Dependency major bumps now or last? | Last (6.2). Same tools, not a migration; do it once behavior is pinned. |
| OQ-13 | Is 1.0.0 published on npm? | If yes: 2.0.0 and a deprecation note on 1.x. If no: you are free to rename the package; the plan assumes the name stays. |
| OQ-14 | Keep the "circle-only surface" coercion? | Drop it in 2.0 unless you remember why it exists; the 1D profile is shape-independent. |
| OQ-15 | Demo: drive it with the headless API or the elements? | Stage through the headless API (proves what you ship), one elements example on the page. |
| OQ-16 | The banding benchmark's thresholds: delete, keep as reporting, or re-tune after research? | Keep as reporting only (0.5). Re-tune only if 5.3 changes the map encoding; otherwise they measure a trade-off you already accepted. |
| OQ-17 | Fix the two pinned geometry quirks found during Phase 1 (one-pixel corner offset in `band.ts`; flipped corner normal in `specularLight.ts`)? | **Done** (commit "OQ-17: sample the band at pixel centers"). The fix went further than the one-liners: pixel-center sampling makes corners and edges agree and the map an exact mirror image, which tests now assert. Not yet eyeballed in a browser. |
| OQ-18 | `specularStrength` applied twice (image clamp × filter slope)? | **Done** in 5.3: the rim is baked at strength 1 into the map's blue channel and the filter applies the strength once. Default 0.9 → 0.81 and presets re-tuned so the look is unchanged. |
| OQ-19 | Motion module (closed-form spring + velocity squash, pure, caller supplies time): research item 5, tagged "trade-off, my call". | Not now. It is what makes 2026 libraries read as "liquid", but it is scope beyond a filter engine and consumers often have Motion or react-spring already. If wanted: a separate `./motion` entry, additive, with reduced-motion snapping; reference constants are in research §4.5. |
| OQ-20 | A content-side `filter: url()` mode so Safari and Firefox refract owned content (research item 4(ii)). | Later, opt-in, only if a product needs refraction outside Chromium. The core is ready (graph is data); the cost is API shape (the call must receive the content), the 4096² WebKit clamp, no `<video>` on Safari, and Firefox's CPU path. Frost suffices for 2.0. |
| OQ-21 | SDF-driven geometry for per-corner radii, superellipse corners matching `corner-shape`, and merging (research items 9, 13, 14). | Defer until a shape need exists. `corner-shape: squircle` alone would make the CSS clip disagree with the circular-corner map, so it needs item 9 first. |
| OQ-22 | HTML-in-Canvas / WebGPU renderer for lensing beyond the box (research item 11). | No. Chromium-only like the SVG path, young reference libraries, read-back gaps. The handle stays renderer-neutral in case WebKit changes the picture. |
| OQ-23 | Where the research doc lives and when it is committed. | **Done** 2026-11-06: committed as `docs/research-liquid-glass-2026.md` (its last edits were wording and line-reference refreshes; the 14 ranked items did not change). CLAUDE.md and README point at that path. If the research session edits it again, that is just another commit. |

---

## 5. Draft `CLAUDE.md`

Written to the repository root as `CLAUDE.md` (uncommitted). It describes the commands as they exist after step 0.1, and the directory rules as they will be once `src/dom` and `src/elements` exist; the rules apply to new code immediately.
