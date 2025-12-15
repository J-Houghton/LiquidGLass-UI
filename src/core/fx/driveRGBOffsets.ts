/**
 * Apply a simple chromatic aberration effect by shifting the red, green and blue channels of an SVG filter.
 *   The UI exposes a `dispersion` scalar and per‑ channel multipliers (`r`, `g`, `b`).  
 *   Those values are multiplied and then clamped into a small range so that the individual offsets never exceed ±8 pixels.
 *   Offsets are written to three `<feOffset>` elements in the DOM (with IDs `offR`, `offG` and `offB`).
 * 
 * This function is side‑effectful: it reads elements from `document` and mutates their `dx`/`dy` attributes.
 * If an element cannot be found the call is silently ignored.
 */
export function driveRgbOffsets(state: { dispersion: number; r: number; g: number; b: number }) {
    // overall dispersion strength
    const k = state.dispersion;
    const clamp = (v: number) => Math.max(-8, Math.min(8, v));
    
    // compute offsets for each channel, scaled by channel ratios
    const R = clamp(k * state.r), G = clamp(k * state.g), B = clamp(k * state.b);
    
    // helper to set the dx/dy attributes on an <feOffset> by id
    const set = (id: string, dx: number, dy: number) => { 
    const el = document.getElementById(id) as SVGFEOffsetElement | null; 
        if (el){ 
            el.setAttribute('dx', String(dx)); 
            el.setAttribute('dy', String(dy)); 
        } 
    };

    // apply horizontal shifts; vertical is kept at 0 since we only split laterally
    set('dispR', R, 0); 
    set('dispG', G, 0); 
    set('dispB', B, 0); // defined in chromatic.ts 
}