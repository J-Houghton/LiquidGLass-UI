# Liquid Glass UI

Physics-based "liquid glass" refraction for the web: a pure TypeScript engine that computes
displacement and specular maps and assembles an SVG filter, applied through `backdrop-filter`.

The package is being modernized into a headless library. The plan, audit, and open decisions are in
`docs/modernization-plan.md`. Read it before starting any step of that work.

## Commands


| Task | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 22. The native `canvas` module is removed in plan step 0.2; after that there are no native modules. |
| Demo playground | `npm run dev` | Vite dev server rooted at `demo/`. |
| Tests (once) | `npm test` | `vitest run`, Node environment, no browser. |
| Tests (watch) | `npm run test:watch` | |
| Typecheck | `npm run typecheck` | Must pass before a PR. Includes the no-DOM check for `src/core` once `tsconfig.core.json` exists. |
| Library build | `npm run build` | Emits `dist/`. |
| Demo build | `npm run build:demo` | Emits `dist-demo/`; this is what GitHub Pages deploys on push to `main`. |

## Layout and import rules

```
src/core/       Pure TypeScript engine. Math, parameter schema, filter description as data.
src/dom/        Browser glue, framework-free: attach/update/destroy, blob URLs, ResizeObserver.
src/elements/   Optional hand-rolled custom elements over src/dom. Separate package entry.
src/components/ Legacy Lit components. Being removed; do not add to them.
demo/           Playground UI (Tweakpane). Never imported by src/.
tests/          Vitest. tests/fixtures/ holds golden data; tests/bench/ holds benchmarks (BENCH=1).
```

Import direction is one-way: `core` ← `dom` ← `elements` ← `demo`. `src/core` imports nothing outside
itself and must compile with `lib: ["ES2022"]` and no DOM types. If a core function needs `document`,
`window`, `ImageData`, `URL`, or `devicePixelRatio`, it belongs in `src/dom` instead; core takes plain
numbers and returns plain data (`RGBAImage`, arrays, `FilterSpec`).

## Hard rules

1. **No framework or runtime dependencies in the published package.** `dependencies` and
   `peerDependencies` in `package.json` stay empty. Lit is being removed, not replaced. Tweakpane,
   Vite, Vitest, and TypeScript are dev-only. Do not add a dependency to fix something a few lines of
   code can fix; if you believe one is genuinely required, say so in the PR and stop.
2. **No DOM access at module evaluation time** anywhere under `src/`. Consumers import this package in
   Next.js server bundles. `customElements.define`, `document.*`, and `class X extends HTMLElement`
   at the top level of a module are all bugs. Registration happens only inside `defineLiquidGlassElements()`.
3. **Tests before refactors.** Any change to `src/core` math or to the filter graph must be preceded by
   (or land with) a fixture or snapshot test that pins the current output. A refactor commit must not
   change fixtures. When a visual change is intended, regenerate fixtures (`UPDATE_FIXTURES=1 npm test`)
   in a separate commit whose message says what changed visually and why.
4. **Zero side effects on import.** `package.json` declares `sideEffects: false`; keep it true.
5. **Every browser-only capability is an injectable seam** (`encodeImage`, `ResizeObserver`, DPR), so
   the DOM layer is testable in Node without canvas.

## Testing notes

- Fixtures compare with tolerance (±1 per 8-bit channel, 1e-9 for curves) because `Math.exp`/`Math.pow`
  can differ by an ulp across engines. Exact invariants (neutral center pixel, symmetry, alpha 255) are
  asserted separately and must never be loosened.
- `tests/bench/banding.spec.ts` compares the current optics against the original algorithm kept in
  `tests/orig_displacement_funcs/`. It prints tables and asserts ratios; it is a benchmark, not a gate.
- The filesystem here is case-insensitive (Windows); CI is Linux. Import paths must match file name case exactly.

## Gotchas

- The filter region is `userSpaceOnUse` at `0 0 width height`, which under `backdrop-filter` is the
  target's border box. Width and height passed to the engine must equal the element's layout size or the
  effect is clipped or stretched.
- Displacement is inward (toward the element center), which is why sampling never reads outside the box.
  Keep it that way unless the research notes say otherwise.
- Blob URLs for the maps are owned by the handle that created them. Never share them across instances;
  revoke them in `destroy()`.
- Safari's support for `backdrop-filter: url(#svg)` is unverified. Do not claim cross-browser support in
  docs until step 5.1 of the plan is done.

## Workflow

- Branch from `main`, PR back to `main`. Pushing to `main` deploys the demo to GitHub Pages.
- Keep commits scoped to one plan step. Reference the step number (for example `Phase 1.2`) in the message.
- Research findings from the parallel survey go in `docs/research/` (create it) and are referenced from
  the `[RESEARCH]` steps in the plan, not pasted into code comments.
