import { Pane } from 'tweakpane';
import { validate } from '../lib/glass/index.ts';
import type { UIState } from '../lib/state/ui-state';

export function buildPane(state: UIState, onChange: (ev: unknown) => void) {
    // Look for a DOM element with ID "pane-root" and mount the pane there if present.
    // Otherwise, tweakpane will insert itself at the end of the document body.
	const container = document.getElementById('pane-root') ?? undefined;
	const pane = new Pane({ title: 'config', expanded: true, ...(container ? { container } : {}) }) as unknown as any;

    // internal helper state: `info` holds computed validation messages for the validation folder; 
	// `internal` flag prevents recursive change notifications when we coerce values back into the state.
	const info = { shape: '', rules: '' };
	let internal = false;
 
	// Surface folder 
	// The available keys correspond directly to the keys of `SURFACE_FNS` in `optics/surfaces.ts`.
	// Changing this control will trigger a re‑build of the displacement maps in the render pipeline. 
	const surf = pane.addFolder({ title: 'surface', expanded: true });
	const surfaceBinding = surf.addBinding(
		state, 'surface',
		{ options: { convex_circle: 'convex_circle', convex_squircle: 'convex_squircle', concave: 'concave', lip: 'lip' } }
	);

	// Material folder
	// Controls physical parameters of the glass: index of refraction, thickness of the interior region 
	//  (mapped through smoothing in validation), bezel width, and overall scale in pixels.
	// The blur controls share a common standard deviation slider regardless of blur type.
	const mat = pane.addFolder({ title: 'material', expanded: true });
	mat.addBinding(state, 'refractiveIndex', { min: 1.0, max: 1.8, step: 0.01, label: 'IOR n₂' });
	const glassBinding = mat.addBinding(state, 'glassThickness', { min: 0, max: 200, step: 1 });
	const bezelBinding = mat.addBinding(state, 'bezelWidth', { min: 1, max: 150, step: 1 });
	mat.addBinding(state, 'scale_px', { min: 0, max: 400, step: 1, label: 'scale (px)' }); 
	mat.addBinding(state, 'blurKind', {
		options: { 'Gaussian': 'gauss', 'Noise 1 (low)': 'noise1', 'Noise 2 (high)': 'noise2' },
		label: 'blur type'
	});
	mat.addBinding(state, 'blurStdDev', { min: 0, max: 1, step: 0.01, label: 'blur (σ)' });
     
    // Specular folder
    // Contains switches for toggling and tuning the specular highlight over the rim: 
	// 	a boolean enable, a light angle in degrees, and a strength multiplier.  
	const spec = pane.addFolder({ title: 'specular', expanded: false });
	spec.addBinding(state, 'showSpecular', { label: 'enable' });
	spec.addBinding(state, 'specularAngleDeg', { min: -180, max: 180, step: 1, label: 'angle (°)' });
	spec.addBinding(state, 'specularStrength', { min: 0, max: 1, step: 0.01, label: 'strength' });
 
    //Layout folder  
	const layout = pane.addFolder({ title: 'layout', expanded: false });
	layout.addBinding(state, 'width', { min: 20, max: 1000, step: 1 });
	layout.addBinding(state, 'height', { min: 10, max: 1000, step: 1 });
	const radiusBinding = layout.addBinding(state, 'radius', { min: 10, max: 200, step: 1 });
	layout.addBinding(state, 'saturation', { min: 0, max: 2, step: 0.1 });
	layout.addBinding(state, 'frost', { min: 0, max: 1, step: 0.01 });
	pane.addBinding(state, 'debug');
     
    //Chromatic folder
    //Controls the strength of the chromatic aberration (dispersion) and the relative offsets for the R/G/B channels. 
	const ca = pane.addFolder({ title: 'chromatic', expanded: false });
	ca.addBinding(state, 'dispersion', { min: 0, max: 3, step: 0.01, label: 'strength' });
	ca.addBinding(state, 'r', { min: -2, max: 2, step: 0.01, label: 'R ratio' });
	ca.addBinding(state, 'g', { min: -2, max: 2, step: 0.01, label: 'G ratio' });
	ca.addBinding(state, 'b', { min: -2, max: 2, step: 0.01, label: 'B ratio' });
	
    // Validation folder
    // Displays messages about shape (circle vs. rect) and any rule coercions applied by `validate`. 
	const infoFolder = pane.addFolder({ title: 'validation', expanded: false });
	const shapeMon = infoFolder.addBinding(info, 'shape', { label: 'shape' });
	const rulesMon = infoFolder.addBinding(info, 'rules', {
		label: 'rules', multiline: true, interval: 0
	});
	function runValidation(ev?: unknown) {
		const v = validate({
			width: state.width, height: state.height,
			radius: state.radius, bezelWidth: state.bezelWidth,
			glassThickness: state.glassThickness, surface: state.surface
		});

		// Build UI messages
		info.shape = `${v.kind} (${state.width}×${state.height})`;
		info.rules = v.notes.length ? v.notes.join(' · ') : 'ok';
		shapeMon.refresh(); rulesMon.refresh();
		// Reflect coerced values back into the UI state without loops
		const changed =
			v.radius !== state.radius ||
			v.bezelWidth !== state.bezelWidth ||
			v.surface !== state.surface;
		if (changed) {
			internal = true;
			state.radius = v.radius;
			state.bezelWidth = v.bezelWidth;
			state.surface = v.surface;
			radiusBinding.refresh();
			bezelBinding.refresh();
			surfaceBinding.refresh();
			glassBinding.refresh();
			internal = false;
		}
		// Forward event to the renderer/update pipeline
		onChange?.(ev ?? {});
	}

	pane.on('change', (ev: unknown) => { if (!internal) runValidation(ev); });
	runValidation();

	return pane as Pane;
}
