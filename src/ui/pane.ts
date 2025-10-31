import { Pane } from 'tweakpane';
import type { SurfaceKind } from '../optics/surfaces';

export interface UIState {
  surface: SurfaceKind;
  refractiveIndex: number; glassThickness: number; bezelWidth: number; scale_px: number;
  showSpecular: boolean; specularAngleDeg: number; specularStrength: number; specularSaturation: number;
  width: number; height: number; radius: number; saturation: number; frost: number;
  debug: boolean;
  dispersion: number; r: number; g: number; b: number;
}

export function buildPane(state: UIState, onChange: (ev: unknown) => void) {
    // Prefer mounting into #pane-root if it exists
    const container = document.getElementById('pane-root') ?? undefined;
    const pane = new Pane({ title: 'config', expanded: true, ...(container ? { container } : {}) }) as unknown as any;
    
    const surf = pane.addFolder({ title: 'surface', expanded: true });
    surf.addBinding(state, 'surface', { options: {convex_circle:'convex_circle', convex_squircle:'convex_squircle', concave:'concave', lip:'lip'} });

    const mat = pane.addFolder({ title: 'material', expanded: true });
    mat.addBinding(state, 'refractiveIndex', { min:1.0, max:1.8, step:0.01, label:'IOR n₂' });
    mat.addBinding(state, 'glassThickness',  { min:0,   max:200, step:1 });
    mat.addBinding(state, 'bezelWidth',      { min:1,   max:150, step:1 });
    mat.addBinding(state, 'scale_px',        { min:0,   max:400, step:1, label:'scale (px)' });

    const spec = pane.addFolder({ title: 'specular', expanded:false });
    spec.addBinding(state, 'showSpecular', { label: 'enable' });
    spec.addBinding(state, 'specularAngleDeg', { min:-180, max:180, step:1, label:'angle (°)' });
    spec.addBinding(state, 'specularStrength', { min:0, max:1, step:0.01, label:'strength' });
    spec.addBinding(state, 'specularSaturation', { min:0, max:50, step:1, label:'sat boost' });

    const layout = pane.addFolder({ title: 'layout', expanded:false });
    layout.addBinding(state, 'width',  { min:160, max:640, step:1 });
    layout.addBinding(state, 'height', { min:120, max:480, step:1 });
    layout.addBinding(state, 'radius', { min:10,  max:200, step:1 });
    layout.addBinding(state, 'saturation', { min:0, max:2, step:0.1 });
    layout.addBinding(state, 'frost', { min:0, max:1, step:0.01 });
    pane.addBinding(state, 'debug');

    const ca = pane.addFolder({ title: 'chromatic', expanded:false });
    ca.addBinding(state, 'dispersion', { min:0, max:3, step:0.01, label:'strength' });
    ca.addBinding(state, 'r', { min:-2, max:2, step:0.01, label:'R ratio' });
    ca.addBinding(state, 'g', { min:-2, max:2, step:0.01, label:'G ratio' });
    ca.addBinding(state, 'b', { min:-2, max:2, step:0.01, label:'B ratio' }); 

    pane.on('change', onChange);
    
    return pane as Pane;
}
