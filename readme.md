# Liquid Glass - Web

**Interactive optical simulation** using CSS filters, SVG compositing, and TypeScript.  
This project creates a dynamic _liquid-glass_ lens effect that refracts, disperses, and reflects light with realistic chromatic and specular behavior.

----------

##  Inspiration

The optics model is **heavily inspired by** [Kube’s “Liquid Glass in CSS & SVG”](https://kube.io/blog/liquid-glass-css-svg).  
That article introduced the core idea of combining SVG displacement maps, blur, and chromatic separation to simulate glass materials directly in the browser.

This implementation **extends and modifies** that concept:

-   Ported to a modular **TypeScript + Vite** architecture.
    
-   Introduces **geometry validation** on existing Surfaces (`Convex_Circle`, `Convex_Squircle`, `Concave`, `Lip`).
    
-   Added **`Tweakpane`** for real-time updates.
    
-   Supports **specular highlights**, **refraction maps**, and **multi-channel RGB dispersion**.
    
-   Optimized update loop and caching for performance on high-DPI displays.
    

----------

##  Tech Stack

-   **Vite + TypeScript** — modern module bundling and dev server.
    
-   **GSAP** — animation and motion control.
    
-   **Tweakpane** — interactive parameter UI.
    
-   **Custom Optics TS** — surface profiles, displacement maps, Fresnel reflection, and specular lighting models.
    
-   **SVG Filters** — compositing and live visual response.
    

----------

## Structure

|Directory |Purpose |
| ------------- | ------------- |
|`src/fx`|Filter cache and RGB channel utilities|
|`src/optics`|Dispersion, displacement, surface, and lighting models|
|`src/ui`|Tweakpane interface and parameter handling|
|`src/validation`|Geometry and material input validation|
|`main.ts`|App entry point and update loop|

----------

## Run

```bash
npm install
npm run dev
```

## Glass component plugin

The build now emits a second bundle with reusable glass web components. After running `npm run build`, you will find
`dist/assets/glass-components.[hash].js` alongside the application entry.

You can load the plugin in any page and drop the predefined effects into markup:

```html
<!-- replace [hash] with the file emitted by the build step -->
<script type="module" src="/dist/assets/glass-components.[hash].js"></script>

<glass-card effect="frosted" style="width: 280px; padding: 1.5rem;">
  <h2>Frosted glass</h2>
  <p>Drop any markup inside the slot — the SVG filter pipeline runs inside the component.</p>
</glass-card>
```

Alternatively, import the factory to register custom effects:

```ts
import { registerGlassComponent } from './src/plugins/glass-components';

registerGlassComponent({
  effect: 'custom',
  defaults: { blur: 0.6, frost: 10, dispersion: 1.5, noise: 'low', specular: 0.3, channels: { r: 1, g: 0.3, b: -0.8 } },
});
```