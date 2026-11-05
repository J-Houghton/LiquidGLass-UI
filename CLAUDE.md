# Liquid Glass UI

Physics-based "liquid glass" refraction for the web: a pure TypeScript engine that computes
displacement and specular maps and assembles an SVG filter, applied through `backdrop-filter`.
Published as `liquid-glass-filter` (2.x, headless).

The design, audit, status and open decisions are in `docs/modernization-plan.md`. Read its
"Status" section before starting work; Phase 5 steps wait on the implementation survey in
`docs/research/`.

## Commands

| Task | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 22. No native modules. |
| Demo playground | `npm run dev` | Vite dev server rooted at `demo/`. |
| Tests (once) | `npm test` | Vitest. Node environment by default; `tests/elements` opt into happy-dom per file. |
| Tests (watch) | `npm run test:watch` | |
| Typecheck | `npm run typecheck` | Whole repo (`tsconfig.test.json`) plus `src/core` with no DOM lib (`tsconfig.core.json`). Must pass before a PR. |
| Library build | `npm run build` | `dist/`: `index`, `core`, `elements` as ESM with bundled `.d.ts`. |
| Demo build | `npm run build:demo` | `dist-demo/`; GitHub Pages deploys this on push to `main`. |
| Benchmark | `BENCH=1 npx vitest run tests/bench` | Banding metrics vs. the original algorithm. Not a gate. |
| Regenerate fixtures | `UPDATE_FIXTURES=1 npm test` | Only in a commit that explains the intended visual change. |

## Layout and import rules

```
src/core/       Pure engine. Parameters (params.ts), optics (optics/), filter description as data
                (filters/spec.ts). Returns RGBAImage / Float64Array / FilterSpec. No DOM, no globals.
src/dom/        Browser glue, framework-free: createGlassFilter, attachLiquidGlass, mountFilter,
                encodeImage, mapCache. Touches document/canvas/URL/ResizeObserver only inside functions.
src/elements/   Hand-rolled custom elements over src/dom. Separate entry; registers nothing on import.
demo/           Playground (Tweakpane). Entry is demo/main.ts; it calls exported init functions.
tests/          Vitest. tests/fixtures = golden data; tests/helpers/fakeDom.ts = tiny DOM stand-in;
                tests/bench = benchmark + the original algorithm as baseline.
```

Import direction is one-way: `core` ← `dom` ← `elements` ← `demo`. `src/core` imports nothing
outside itself and must compile with `lib: ["ES2022"]` and no ambient types (`npm run typecheck`
enforces it). If core code needs `document`, `window`, `ImageData`, `URL` or `devicePixelRatio`,
it belongs in `src/dom`; core takes numbers and returns data.

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
- Known, pinned geometry quirks (plan OQ-17): corner pixels on the right/bottom sit one pixel
  deeper in the band than left/top, and the specular corner normal is flipped relative to the
  edges. Changing either is a visual change: fixtures, own commit, say so.
- Safari's support for `backdrop-filter: url(#svg)` is unverified. Do not claim cross-browser
  support until plan step 5.1 is done.

## Workflow

- Branch from `main`, PR back to `main`. Pushing to `main` deploys the demo to GitHub Pages.
- One plan step per commit, step number in the message (for example `Phase 5.1`).
- Research findings from the survey go in `docs/research/` and are referenced from the
  `[RESEARCH]` steps in the plan, not pasted into code comments.
