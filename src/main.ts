import { gsap } from 'gsap'
import { clearDynamic, build } from './filters/core';
import { chromatic } from './filters/chromatic';
import { blur } from './filters/blur';
import { specular } from './filters/specularFilter';
import { noiseBlur } from './filters/noiseBlur';
import { buildPane } from './ui/pane'
import { enableDrag } from './ui/drag'
import { SURFACE_FNS, type SurfaceKind } from './optics/surfaces'
import { calculateDisplacementMap } from './optics/disp1d'
import { calculateDisplacementMap2 } from './optics/disp2d'
import { buildSpecularImage } from './optics/specularLight'
import { driveRgbOffsets, setRgbOffsets } from './fx/rgbSplit'
import { blobPath } from './geom/blob'
import { validate } from './validation/geometry'
import { cache, imageDataToBlobURL } from './fx/filterCache' 
import './ui/components/glass-hero'
import '../style.css'

/* ===== Config ===== */
type State = {
    width: number; height: number; radius: number;
    refractiveIndex: number; glassThickness: number; bezelWidth: number; scale_px: number;
    showSpecular: boolean; specularAngleDeg: number; specularStrength: number; specularSaturation: number;
    dispersion: number; r: number; g: number; b: number; blurStdDev: number;
    blurKind: 'gauss' | 'noise1' | 'noise2';
    surface: SurfaceKind; saturation: number; frost: number; debug: boolean;
	fx: number; fy: number;
};
const state: State = {
    width: 400, height: 300, radius: 110,                 // layout
    refractiveIndex: 1.5, glassThickness: 50,              // material
    bezelWidth: 60, scale_px: 180, dispersion: 0.0,        // optics
    surface: 'convex_circle',                               // surface
    frost: 0.05, saturation: 1, debug: false,  
    blurStdDev: 0.7,
    blurKind: 'gauss',
    showSpecular: true,
    specularAngleDeg: 60,  // [-180..180]
    specularStrength: 0.9,  // [0..1]
    specularSaturation: 0,  // [0..50]
    r: 1.0, g: 0.25, b: -1.0,
	fx: 0, fy: 0,
}

/* ===== Debug helpers (optional overlays) ===== */
function drawArrowsFromRG(imageData: ImageData, step = 18, len = 15) {
    const { width: W, height: H, data } = imageData
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const g = cv.getContext('2d');
    if (!g) throw new Error('2D context not available');
    g.clearRect(0, 0, cv.width, cv.height);
    for (let y = step >> 1; y < H; y += step) {
        for (let x = step >> 1; x < W; x += step) {
            const idx = (y * W + x) * 4
            const nx = (data[idx + 0] - 128) / 127
            const ny = (data[idx + 1] - 128) / 127
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + nx * len, y + ny * len); g.stroke()
        }
    }
    return cv
}

function drawSurfacePlot(fn: (x: number) => number, bezelPx: number, glassPx: number) {
    const W = 300, H = 120, pad = 8
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d')
    if (!g) throw new Error('2D context not available');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(pad, H - pad); g.lineTo(W - pad, H - pad); g.stroke()
    g.beginPath(); g.moveTo(pad, H - pad); g.lineTo(pad, pad); g.stroke()
    g.strokeStyle = '#7cf'; g.beginPath()
    for (let i = 0; i <= W - 2 * pad; i++) {
        const t = i / (W - 2 * pad), y = fn(t)
        const X = pad + i, Y = H - pad - y * (H - 2 * pad)
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y)
    }
    g.stroke()
    g.fillStyle = 'rgba(255,0,255,0.25)'
    const bezelFrac = Math.min(1, Math.max(0, bezelPx / Math.max(1, bezelPx + glassPx)))
    g.fillRect(pad, pad, (W - 2 * pad) * bezelFrac, H - 2 * pad)
    g.fillStyle = '#fff'; g.globalAlpha = 0.8; g.font = '12px system-ui'
    g.fillText(`bezel ${Math.round(bezelPx)}px · glass ${Math.round(glassPx)}px`, pad + 6, pad + 14)
    return c
}

function placeEffect() {
    const dp = document.querySelector('.dock-placeholder') as HTMLElement | null;
    if (!dp) return;
    const { top, left } = dp.getBoundingClientRect()
    gsap.set('.effect', { top: top > window.innerHeight ? window.innerHeight * 0.5 : top, left, opacity: 1 })
}

/* ===== Wiring ===== */
const debugRoot = document.querySelector('.displacement-debug') as HTMLElement | null

// single RAF gate
let raf = 0;
function requestUpdate() { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }
const shape = document.getElementById('blobShape') as SVGPathElement | null
const disp = document.getElementById('disp') as SVGFEDisplacementMapElement | null
// Base rectangle you want to look like glass 
if (shape) shape.setAttribute('d', blobPath(
    0, 0,state.width, state.height, state.radius, state.radius, 0, 0))
// State and smoothing 
const apply = () => {
  if (!shape) return
  shape.setAttribute('d', blobPath(0, 0, state.width, state.height, state.radius, state.radius, state.fx, state.fy))
  // optional: a little extra refraction when “squished”
  if (disp) {
    const s = Math.min(20, 6 + 40 * Math.hypot(state.fx, state.fy))
    disp.setAttribute('scale', s.toFixed(2))
  }
}

// Smoothly chase new targets for a liquid feel
const target = { fx: 0, fy: 0 }
gsap.ticker.add(() => {
  state.fx += (target.fx - state.fx) * 0.25
  state.fy += (target.fy - state.fy) * 0.25
  apply()
})

// Map velocity -> deformation; release -> bouncy return
enableDrag('.effect', ({ vx, vy }) => {
  // pixels/ms -> normalized factor. Tune 35 if needed.
  target.fx = Math.max(-1, Math.min(1, vx * 35))
  target.fy = Math.max(-1, Math.min(1, vy * 35))
})

document.addEventListener('pointerup', () => {
  target.fx = 0; target.fy = 0
  // small overshoot on release
  gsap.to(state, {
    fx: 0, fy: 0, duration: 0.45, ease: 'back.out(2)', onUpdate: apply
  })
})
buildPane(state, requestUpdate); 
placeEffect();
update();

// -----------------------------------------------------------------------------
// Update helpers
//
// To improve readability and testability the monolithic `update` function is
// decomposed into smaller operations.  Each helper mutates global state or
// the DOM as appropriate.  They are invoked in sequence by `update`.

// Validate the current UI state and return a validated structure. 
function computeValidated() {
  const v = validate({
    width: state.width,
    height: state.height,
    radius: state.radius,
    bezelWidth: state.bezelWidth,
    glassThickness: state.glassThickness,
    surface: state.surface,
  });
  if (v.notes.length) {
    console.debug('[validate]', v.notes.join(' · '));
  }
  // Propagate coerced surface back onto state so future calls see it
  state.surface = v.surface;
  // Also propagate radius and bezel width in case they were clamped.
  // The UI binding will take care of refreshing controls via validation on next interactation.
  state.radius = v.radius;
  state.bezelWidth = v.bezelWidth;
  return v;
}

/**
 * Rebuild the 2D displacement image if the shape, size, thickness or IOR changed.
 * Uses `cache.dispKey` to avoid recomputation.
 * Updates the `<feImage result="map">` element with a new blob URL and stores the
 *  image data for debug overlays.
 */
async function rebuildDisplacementIfNeeded(v: ReturnType<typeof computeValidated>) {
  const surf = SURFACE_FNS[v.surface].fn;
  const dispKey = JSON.stringify({
    w: v.width,
    h: v.height,
    r: v.radius,
    b: v.bezelWidth,
    n: state.refractiveIndex,
    t: v.glassThickness_eff,
    surface: state.surface,
  });
  if (cache.dispKey === dispKey) return;
  // build 1D displacement profile
  const disp1D = calculateDisplacementMap(
    v.glassThickness_eff,
    v.bezelWidth,
    surf,
    state.refractiveIndex,
    512,
  );
  // normalize by max absolute value
  const maxAbs = disp1D.reduce((m, val) => Math.max(m, Math.abs(val)), 1);
  const img = calculateDisplacementMap2(
    v.width,
    v.height,
    v.radius,
    v.bezelWidth,
    maxAbs,
    disp1D,
  );
  // update cache and DOM
  if (cache.dispUrl) URL.revokeObjectURL(cache.dispUrl);
  cache.dispUrl = await imageDataToBlobURL(img);
  cache.dispKey = dispKey;
  cache.dispImg = img;
  const feMap = document.querySelector('feImage[result="map"]') as SVGFEImageElement | null;
  if (feMap && cache.dispUrl) feMap.setAttribute('href', cache.dispUrl);
}

// Set channel selectors and base scale for the displacement filter element. 
function updateDisplacementElement() {
  const dispEl = document.getElementById('disp');
  if (dispEl) {
    dispEl.setAttribute('xChannelSelector', 'R');
    dispEl.setAttribute('yChannelSelector', 'G');
    dispEl.setAttribute('scale', String(state.scale_px));
  }
}

/**
 * Rebuild the specular highlight image when geometry or lighting changes and
 *  update the corresponding `<image>` and `<feComponentTransfer>` elements.
 */
async function rebuildSpecularIfNeeded(v: ReturnType<typeof computeValidated>) {
  const specKey = JSON.stringify({
    w: v.width,
    h: v.height,
    r: v.radius,
    b: v.bezelWidth,
    a: state.specularAngleDeg,
    s: state.specularStrength,
    on: state.showSpecular,
  });
  if (cache.specKey === specKey) return;
  if (cache.specUrl) {
    URL.revokeObjectURL(cache.specUrl);
    cache.specUrl = null;
  }
  if (state.showSpecular) {
    const specImg = buildSpecularImage(
      v.width,
      v.height,
      v.radius,
      v.bezelWidth,
      state.specularAngleDeg,
      state.specularStrength,
    );
    cache.specUrl = await imageDataToBlobURL(specImg);
  }
  cache.specKey = specKey;
  const specImgEl = document.getElementById('specImage') as SVGImageElement | null;
  if (specImgEl) {
    specImgEl.setAttribute('href', cache.specUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
  }
  const specGain = document.getElementById('specGain') as SVGComponentTransferFunctionElement | null;
  if (specGain) specGain.setAttribute('slope', '1');
}

/**
 * Assemble and apply dynamic filter stages after the base refraction stage.
 * This includes chromatic aberration, blur (Gaussian or noise), and specular multiplication.
 * The filter stages are rebuilt on every update because their parameters can change per frame.
 */
function assembleFilterStages() {
  const filterEl = document.getElementById('filter') as SVGFilterElement | null;
  if (!filterEl) return;
  clearDynamic(filterEl);
  const stages: any[] = [];
  // optional chromatic aberration
  if (state.dispersion > 0) stages.push(chromatic);
  // pick exactly one blur implementation and supply current standard deviation
  if (state.blurKind === 'gauss') {
    stages.push(blur(state.blurStdDev));
  } else if (state.blurKind === 'noise1') {
    stages.push(noiseBlur('low', state.blurStdDev));
  } else {
    stages.push(noiseBlur('high', state.blurStdDev));
  }
  // optional specular multiply stage
  if (state.showSpecular) stages.push(specular(state.specularStrength));
  build(filterEl, 'refr', stages);
}

/**
 * Drive chromatic offsets and update CSS custom properties for geometry and material parameters.
 * Calculates Fresnel reflectance for F0 and applies debug flag to the root element.
 */
function applyCssVars(v: ReturnType<typeof computeValidated>) {
  // drive per‑channel offsets if dispersion is enabled
  if (state.dispersion > 0) {
    driveRgbOffsets(state);
  }
  const F0 = ((state.refractiveIndex - 1) / (state.refractiveIndex + 1)) ** 2;
  gsap.set(document.documentElement, {
    '--width': v.width,
    '--height': v.height,
    '--radius': v.radius,
    '--frost': state.frost,
    '--saturation': state.saturation,
    '--F0': F0,
  });
  document.documentElement.dataset.debug = String(!!state.debug);
}

/**
 * When debug mode is active render the displacement image, vector field and
 * specular preview into a floating overlay.  Reuses cached images if
 * available; falls back to generating reduced‑resolution maps on the fly.
 */
function renderDebugOverlay(v: ReturnType<typeof computeValidated>) {
  if (!state.debug || !debugRoot) return;
  debugRoot.innerHTML = '';
  const surf = SURFACE_FNS[v.surface].fn;
  // reuse cached displacement image or build a smaller one quickly
  let dbgImg = cache.dispImg;
  if (!dbgImg) {
    const disp1D = calculateDisplacementMap(
      v.glassThickness_eff,
      v.bezelWidth,
      surf,
      state.refractiveIndex,
      256,
    );
    const maxAbs = disp1D.reduce((m, val) => Math.max(m, Math.abs(val)), 1);
    dbgImg = calculateDisplacementMap2(
      Math.max(160, Math.floor(v.width * 0.5)),
      Math.max(120, Math.floor(v.height * 0.5)),
      Math.max(10, Math.floor(v.radius * 0.5)),
      Math.max(1, Math.floor(v.bezelWidth * 0.5)),
      maxAbs,
      disp1D,
    );
  }
  // preview image
  const c = document.createElement('canvas');
  c.width = dbgImg.width;
  c.height = dbgImg.height;
  const ctx = c.getContext('2d');
  if (ctx) ctx.putImageData(dbgImg, 0, 0);
  c.style.width = state.width + 'px';
  c.style.height = state.height + 'px';
  c.className = 'displacement-image';
  debugRoot.appendChild(c);
  // vector field overlay
  const arrows = drawArrowsFromRG(dbgImg, 18, 15);
  arrows.style.width = '100%';
  arrows.style.height = '100%';
  arrows.style.position = 'absolute';
  arrows.style.inset = '0';
  debugRoot.appendChild(arrows);
  // surface profile plot
  if (typeof drawSurfacePlot === 'function') {
    const surfPlot = drawSurfacePlot(surf, v.bezelWidth, v.glassThickness_eff);
    surfPlot.style.position = 'absolute';
    surfPlot.style.left = '50%';
    surfPlot.style.top = 'calc(100% + 8px)';
    surfPlot.style.translate = '-50% 0';
    debugRoot.appendChild(surfPlot);
  }
  // specular preview
  if (state.showSpecular) {
    const sImg = buildSpecularImage(
      v.width,
      v.height,
      v.radius,
      v.bezelWidth,
      state.specularAngleDeg,
      state.specularStrength,
    );
    const sC = document.createElement('canvas');
    sC.width = sImg.width;
    sC.height = sImg.height;
    const sg = sC.getContext('2d');
    if (sg) sg.putImageData(sImg, 0, 0);
    sC.style.width = state.width + 'px';
    sC.style.height = state.height + 'px';
    sC.style.position = 'absolute';
    sC.style.inset = '0';
    sC.style.mixBlendMode = 'screen';
    sC.style.opacity = '0.9';
    debugRoot.appendChild(sC);
  }
}

/**
 * Main update routine invoked on every animation frame.  Delegates to helper
 * functions defined above.  Designed to be as small as possible for clarity.
 */
async function update() {
  const v = computeValidated();
  await rebuildDisplacementIfNeeded(v);
  updateDisplacementElement();
  await rebuildSpecularIfNeeded(v);
  assembleFilterStages();
  applyCssVars(v);
  renderDebugOverlay(v);
}