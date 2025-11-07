# Liquid Glass Filter

This package provides a self‑contained implementation of the “liquid glass”
SVG filter effect for use in web applications built with
[Lit](https://lit.dev/).  It exposes two custom elements:

- **`<liquid-glass-filter>`** – defines an invisible `<filter>` element
  containing the displacement, blur, chromatic aberration and specular
  primitives.  The filter is updated automatically when any of its
  parameters change.  To apply the effect to an element, reference the
  filter’s `filter-id` from CSS via `backdrop-filter: url(#… )`.

- **`<liquid-glass-container>`** – a convenience wrapper that combines a
  `<liquid-glass-filter>` with a frosted overlay.  It positions itself using
  the provided width, height and radius and applies a translucent white
  layer with the liquid glass filter applied.  Use this element when you
  simply want to drop a glassy shape into your page without wiring up
  CSS yourself.

Both components are written in TypeScript and ship with source only.  You
can compile them as part of your own build or import them directly into a
modern bundler setup.

## File layout

The library is organised under the `src/lib` directory:

| Path | Purpose |
| --- | --- |
| `optics/disp1d.ts` | Calculates one‑dimensional refraction displacements across the bezel. |
| `optics/disp2d.ts` | Builds a two‑dimensional displacement map from the 1D profile. |
| `optics/specularLight.ts` | Generates the specular highlight map. |
| `optics/surfaces.ts` | Defines the supported surface profiles (convex, concave, lip). |
| `filters/*` | Small composable SVG filter primitives used to assemble the full effect. |
| `fx/filterCache.ts` | Simple cache for displacement and specular image blobs. |
| `validation/geometry.ts` | Validates and coerces geometry inputs (dimensions, radius, bezel). |
| `images.ts` | High‑level helpers to rebuild displacement and specular maps. |
| `filterGraph.ts` | Runtime builder that assembles and updates the filter graph. |
| `liquid-glass-filter.ts` | Custom element defining the standalone filter. |
| `liquid-glass-container.ts` | Custom element combining the filter with a frosted overlay. |

The entry point `src/index.ts` re‑exports the custom elements and some of
the optical helpers.

## Usage

Install the `lit` library in your project and copy the contents of this
package into your source tree.  Then import and register the custom
elements:

```ts
import 'path/to/liquid-glass-filter.js';
import 'path/to/liquid-glass-container.js';
```

### Standalone filter

To attach the effect to any element, include a `<liquid-glass-filter>` in
your markup and reference its `filter-id` from CSS:

```html
<!-- Define the filter somewhere in your document -->
<liquid-glass-filter
  filter-id="glass"
  width="400"
  height="200"
  radius="50"
  bezel-width="50"
  glass-thickness="80"
  scale-px="220"
  surface="convex_squircle"
  refractive-index="1.5"
  show-specular
></liquid-glass-filter>

<!-- Apply it to a backdrop via CSS -->
<div class="glass-panel">
  ...content...
</div>

<style>
.glass-panel {
  /* The backdrop filter references the id defined above */
  backdrop-filter: url(#glass) saturate(1);
  -webkit-backdrop-filter: url(#glass) saturate(1);
  /* Optional styling to make the panel visible */
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 50px;
  padding: 1rem;
}
</style>
```

Every numeric attribute on `<liquid-glass-filter>` is reactive.  Changing
properties such as `scale-px`, `dispersion`, `blur-kind`, `blur-std-dev` or
`specular-strength` will trigger a rebuild of the underlying images and
update the filter graph automatically.

### Container overlay

The `<liquid-glass-container>` element wraps a filter and applies it
directly.  This is useful when you just need a glassy shape without
managing CSS yourself:

```html
<liquid-glass-container
  width="300"
  height="120"
  radius="40"
  frost="0.08"
  saturation="1.2"
  surface="lip"
  show-specular
></liquid-glass-container>
```

The container positions itself according to the supplied dimensions and
applies a semi‑transparent white overlay with the chosen filter.  It does
not intercept pointer events; interactions pass through to elements
underneath.

## Updating parameters dynamically

Since both custom elements expose their parameters as standard properties,
you can update them from JavaScript at runtime.  For example:

```ts
const filter = document.querySelector('liquid-glass-filter')!;
filter.scalePx = 240;
filter.dispersion = 2;
filter.blurKind = 'noise1';
filter.blurStdDev = 0.3;
```

The element will automatically recompute the necessary images and update the
filter graph.  The same applies to a `<liquid-glass-container>`; any
changes to its properties are forwarded to the internal filter.

## Development

The library is written in TypeScript and relies on modern ES module imports.
To develop locally or try out the demo UI contained in `index.html`, run a
development server using [Vite](https://vitejs.dev/).  This will
transpile the TypeScript on the fly and allow you to import `.ts` files
in the browser:

```sh
npm install
# Start the Vite dev server and open the printed URL (e.g. http://localhost:5173)
npm run dev
```

The root `index.html` provides a simple form to adjust the filter
parameters and observe the effect in real time.  Because browsers
cannnot execute TypeScript directly, you must either run a bundler such
as Vite or compile the sources ahead of time.  To produce a static
build, run:

```sh
# Compile TypeScript to JavaScript
npx tsc
# Build and bundle the library for production
npm run build
```

This will emit compiled JavaScript under `dist/`.  You can then modify
your HTML to import the built `index.js` rather than the TypeScript
sources.

The published package itself does not include any demo UI, debug pages
or example controls; only the core filter and a lightweight container
are included to keep the distribution lean and production‑ready.  The
`index.html` demonstration is provided solely for local testing.