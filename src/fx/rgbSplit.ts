// cheap RGB split via offsets;
export function driveRgbOffsets(state: { dispersion: number; r: number; g: number; b: number }) {
    const k = state.dispersion;
    const clamp = (v: number) => Math.max(-8, Math.min(8, v));

    const R = clamp(k * state.r), G = clamp(k * state.g), B = clamp(k * state.b);
    const set = (id: string, dx: number, dy: number) => { 
    const el = document.getElementById(id) as SVGFEOffsetElement | null; 
        if (el){ 
            el.setAttribute('dx', String(dx)); 
            el.setAttribute('dy', String(dy)); 
        } 
    };
    
    set('offR', R, 0); set('offG', G, 0); set('offB', B, 0); // defined in HTML 
}