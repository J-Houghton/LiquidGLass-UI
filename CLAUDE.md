# Liquid Glass UI

Physics-based "liquid glass" refraction for the web: a pure TypeScript engine that computes
displacement and specular maps and assembles an SVG filter, applied through `backdrop-filter`.
Published as `liquid-glass-filter` (2.x, headless).

The design, audit, status and open decisions are in `docs/modernization-plan.md`. Read its
"Status" section before starting work. The verified survey of the field that drove Phase 5 is
`docs/research-liquid-glass-2026.md`; cite it rather than re-deriving browser-support claims.
The consumer-facing guide is `docs/usage.md`; a public API change updates it (and the README
tables) in the same PR.

## Commands

| Task | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 22. No native modules. |
| Demo playground | `npm run dev` | Vite dev server rooted at `demo/`. |
| Tests (once) | `npm test` | Vitest. Node environment by default; `tests/elements` opt into happy-dom per file. |
| Tests (watch) | `npm run test:watch` | |
| Typecheck | `npm run typecheck` | Whole repo (`tsconfig.test.json`) plus `src/core` with no DOM lib (`tsconfig.core.json`). Must pass before a PR. |
| Library build | `npm run build` | `dist/`: `index`, `core`, `elements`, `motion` as ESM with `.d.ts`; `scripts/check-dist.mjs` guards it. |
| Demo build | `npm run build:demo` | `dist-demo/`; GitHub Pages deploys this on push to `main`. |
| Benchmark | `BENCH=1 npx vitest run tests/bench` | Banding metrics vs. the original algorithm. Not a gate. |
| Regenerate fixtures | `UPDATE_FIXTURES=1 npm test` | Only in a commit that explains the intended visual change. |
| Screenshot harness | `npm run dev -- --port 5178`, then `node scripts/visual-shot.mjs out.png 'a={...}&b={...}&base={...}'` | Deterministic `demo/visual.html` scene, one glass per query variant, headless local Chrome/Edge, no extra deps. View the PNG with the Read tool. |
| Screenshot diff | `node scripts/png-diff.mjs before.png after.png diff.png` | Exit 0 when identical; prints differing pixel count, mean/max delta and bounding box. |

## Layout and import rules

```
src/core/       Pure engine. Parameters (params.ts), optics (optics/: band walk, 1D curve, map with
                rim in B, standalone specular), filter description as data (filters/spec.ts).
                Returns RGBAImage / Float64Array / FilterSpec. No DOM, no globals.
src/motion/     Pure motion model: closed-form spring (spring.ts), velocity squash (squash.ts). No DOM,
                no clock; the caller supplies dt. Own entry `./motion`.
src/dom/        Browser glue, framework-free: createGlassFilter, attachLiquidGlass (support detection,
                frost fallback, reduced transparency, content-side mode), attachGlassMotion (rAF loop
                over src/motion), mountFilter, encodeImage, mapCache (shared refcounted registry),
                support. Touches document/canvas/URL/ResizeObserver only inside functions.
src/elements/   Hand-rolled custom elements over src/dom. Separate entry; registers nothing on import.
demo/           Playground (Tweakpane). Entry is demo/main.ts; it calls exported init functions.
tests/          Vitest. tests/fixtures = golden data; tests/helpers/fakeDom.ts = tiny DOM stand-in;
                tests/bench = benchmark + the original algorithm as baseline.
```

Import direction is one-way: `core`, `motion` ← `dom` ← `elements` ← `demo`. `src/core` and
`src/motion` import nothing outside themselves and must compile with `lib: ["ES2022"]` and no
ambient types (`npm run typecheck` enforces it). If such code needs `document`, `window`,
`ImageData`, `URL`, `devicePixelRatio` or `requestAnimationFrame`, it belongs in `src/dom`; core
and motion take numbers and return data.

## Hard rules

1. **No framework or runtime dependencies in the published package.** `dependencies` and
   `peerDependencies` stay absent. Tweakpane, Vite, Vitest, TypeScript, happy-dom and
   `@types/node` are dev-only. Do not add a dependency to fix what a few lines can fix; if one
   is genuinely required, say so in the PR and stop.
2. **No DOM access at module evaluation time** anywhere under `src/`. Consumers import this in
   Next.js server bundles. `customElements.define`, `document.*` and `class X extends HTMLElement`
   at module top level are bugs (`src/elements` uses `ElementBase`, which falls back to a plain
   class on a server). Registration happens only inside `defineLiquidGlassElements()`.
3. **Tests before refactors.** Any change to `src/core` math or to `buildFilterSpec` lands with a
   fixture or snapshot that pins the current output first. A refactor commit must not change
   fixtures. An intended visual change regenerates them in its own commit that says what changed.
   For anything that touches rendering: take baseline screenshots with the harness before the
   change, the same ones after, diff them, look at the PNGs, and state the verdict in the commit.
   "No visual change" means `png-diff` reports identical.
4. **`sideEffects: false` stays true.** Consequence: never rely on side-effect-only imports
   inside this package, including the demo (`import './x.ts'` gets tree-shaken; call an exported
   function instead).
5. **Every browser-only capability is an injectable seam** (`encodeImage`, `revokeImage`,
   `resizeObserver`, `document`, `dpr`) so the DOM layer is testable in Node without canvas.

## Testing notes

- Fixtures compare with tolerance (±0.5 on block means, 1e-9 on curves) because `Math.pow` and
  `Math.exp` can differ by an ulp across engines. Exact invariants (neutral center pixel, alpha
  255, rim mask values, straight-edge mirroring, light-angle symmetry) are asserted separately
  and must never be loosened.
- DOM-layer tests use `tests/helpers/fakeDom.ts` with stub encoders; element lifecycle tests use
  `// @vitest-environment happy-dom` and `defineLiquidGlassElements({ defaults: { encodeImage } })`.
- The filesystem here is case-insensitive (Windows); CI is Linux. Import paths must match file
  name case exactly.
- Pipe test output through `grep` only with `set -o pipefail`, or check `${PIPESTATUS[0]}`.

## Gotchas

- The filter region is `userSpaceOnUse` at `0 0 width height`, which under `backdrop-filter` is the
  target's border box. The width and height the engine gets must equal the element's layout size.
- Displacement points inward (toward the center), which is why sampling never reads outside the
  box. Keep it that way unless the research notes say otherwise.
- Blob URLs for the maps belong to the handle that made them; `destroy()` revokes them. Never share
  them across handles.
- `HTMLElement.prototype.blur()` exists, so the elements expose the `blur` parameter as `blurAmount`.
- The band is sampled at pixel centers and computed for one quadrant, then mirrored. Tests assert
  exact mirror symmetry and equivalence with a naive walk; keep both properties.
- One map image carries everything: R,G displacement, B lighting signed around 128 (light above,
  baked at strength 1; shade below, the normalized stretch profile). The filter applies
  `specularStrength` and `shade` once. Changing `specularAngleDeg` regenerates the map on purpose.
- The filter region is `objectBoundingBox 0 0 1 1` with `primitiveUnits="userSpaceOnUse"` and no
  feImage subregion (unless `regionPadding` > 0), so resizes rewrite nothing on the graph. Keep it.
- Maps are capped at `maxMapPixels` (320k device px) and stretched; `debug.mapDpr` tells you the ratio.
- Browser support is settled, not a guess: the lens renders only in Chromium; WebKit and Gecko parse
  `backdrop-filter: url()` but render nothing, so `detectGlassSupport()` is an engine sniff by
  necessity and `attachLiquidGlass` falls back to CSS frost. Tests that want the glass path in
  happy-dom or the fake DOM must pass `support: 'full'`.
- Content-side mode (`content` option, `buildFilterSpec` `region`) applies the graph with `filter: url()`
  to an element the consumer owns. Rules that are not obvious: one lens per content element (the
  filter is a property of that element); the blur always runs before displacement there, because a
  blur after it would feather the lens rectangle and the hole cut from the source would show through;
  a move is `setLens()`, attribute writes only, never a map; Safari < 27 needs `bumpFilterId`, which
  makes `handle.id`/`handle.url` change per render. Tests force it with `mode: 'content'` or
  `support: 'frost', contentSupport: true`.
- Motion (`attachGlassMotion`): the rAF loop must sleep at rest (tests assert `running` is false and
  no frame is pending) and the transform must be removed at rest, not left as an identity. Springs
  are closed-form; never add an integrator with a fixed step. In content mode no transform is
  written by default. Tests drive it with the `now`/`animationFrame` seams and happy-dom pointer
  events; the harness freezes frames with `motion=press|release|drag&t=`.

## Workflow

- Branch from `main`, PR back to `main`. Pushing to `main` deploys the demo to GitHub Pages.
- No npm publishing for now (plan 6.3 deferred). Other local projects consume the built package:
  run `npm run build` here, then in the consumer `npm install <path-to-this-repo>` (npm symlinks
  it and resolves `exports` to `dist/`), or point a Vite alias at `src/` for live source.
- One plan step per commit, step number in the message (for example `Phase 5.1`).
- Research findings live in `docs/research-liquid-glass-2026.md` and are referenced from the plan,
  not pasted into code comments. Cite the item number ("research item 2") in commits that act on it.
