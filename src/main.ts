import { gsap } from 'gsap'
import { buildPane } from './ui/pane'
import { enableDrag } from './ui/drag'
import { SURFACE_FNS, type SurfaceKind } from './optics/surfaces'
import { calculateDisplacementMap } from './optics/disp1d'
import { calculateDisplacementMap2 } from './optics/disp2d'
import { buildSpecularImage } from './optics/specular'
import { buildBezelMaskImage } from './optics/bezelMask'
import { driveRgbOffsets } from './fx/rgbSplit'
import { driveSaturation } from './fx/satBoost'
import { cache, imageDataToBlobURL } from './fx/filterCache'  
import './ui/components/glass-hero'
import '../style.css'


/* ===== Config ===== */
type State = {
  width: number; height: number; radius: number;
  refractiveIndex: number; glassThickness: number; bezelWidth: number; scale_px: number;
  showSpecular: boolean; specularAngleDeg: number; specularStrength: number; specularSaturation: number;
  dispersion: number; r: number; g: number; b: number;
  surface: SurfaceKind; saturation: number; frost: number; debug: boolean;
};
const state: State = {
    width: 400, height: 300, radius: 110,                 // layout
    refractiveIndex: 1.5, glassThickness: 50,              // material
    bezelWidth: 60, scale_px: 180, dispersion: 0.0,        // optics
    surface: 'convex_circle',                               // surface
    frost: 0.05, saturation: 1, debug: false,  // top: false, preset: 'dock',
    showSpecular: true,
    specularAngleDeg: 60,  // [-180..180]
    specularStrength: 0.9,  // [0..1]
    specularSaturation : 0,  // [0..50]
    r: 1.0, g: 0.25, b: -1.0, 
}

/* ===== Debug helpers (optional overlays) ===== */
function drawArrowsFromRG(imageData: ImageData, step=18, len=15){
    const { width: W, height: H, data } = imageData
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H
    const g = cv.getContext('2d');
    if (!g) throw new Error('2D context not available');
    g.clearRect(0,0,cv.width,cv.height);
    for (let y = step>>1; y < H; y += step){
        for (let x = step>>1; x < W; x += step){
        const idx = (y * W + x) * 4
        const nx = (data[idx+0] - 128) / 127
        const ny = (data[idx+1] - 128) / 127
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + nx*len, y + ny*len); g.stroke()
        }
    }
    return cv
}

function drawSurfacePlot(fn: (x: number)=>number, bezelPx: number, glassPx: number){
    const W = 300, H = 120, pad = 8
    const c = document.createElement('canvas'); c.width=W; c.height=H
    const g = c.getContext('2d')
    if (!g) throw new Error('2D context not available');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0,0,W,H)
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(pad,H-pad); g.lineTo(W-pad,H-pad); g.stroke()
    g.beginPath(); g.moveTo(pad,H-pad); g.lineTo(pad,pad); g.stroke()
    g.strokeStyle = '#7cf'; g.beginPath()
    for (let i=0;i<=W-2*pad;i++){
        const t = i/(W-2*pad), y = fn(t)
        const X = pad + i, Y = H - pad - y*(H-2*pad)
        if (i===0) g.moveTo(X,Y); else g.lineTo(X,Y)
    }
    g.stroke()
    g.fillStyle='rgba(255,0,255,0.25)'
    const bezelFrac = Math.min(1, Math.max(0, bezelPx / Math.max(1, bezelPx + glassPx)))
    g.fillRect(pad,pad,(W-2*pad)*bezelFrac,H-2*pad)
    g.fillStyle='#fff'; g.globalAlpha=0.8; g.font='12px system-ui'
    g.fillText(`bezel ${Math.round(bezelPx)}px · glass ${Math.round(glassPx)}px`, pad+6, pad+14)
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

buildPane(state, requestUpdate);
enableDrag('.effect');

placeEffect();
update();

async function update() {
    // pick surface fn (used by both build and debug)
    const surf = SURFACE_FNS[state.surface].fn
    
    // clamp
    const rMax = Math.max(1, Math.floor(Math.min(state.width, state.height) / 2) - 1);
    state.radius = Math.min(Math.max(1, state.radius), rMax);

    // build-dispatch cache keys
    const dispKey = JSON.stringify({
        w: state.width, h: state.height, 
        r: state.radius, b: state.bezelWidth, 
        n: state.refractiveIndex, t: state.glassThickness, 
        surface: state.surface 
    });

    if (cache.dispKey !== dispKey) { 
        
        // 1) Build 1D displacement with current thickness and IOR 
        const disp1D = calculateDisplacementMap(state.glassThickness, state.bezelWidth, surf, state.refractiveIndex, 512); 
        // 2) Normalize by the absolute max of that curve
        const maxAbs = disp1D.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
        // 3) Pack RG field for the whole effect box (rounded-rect bezel only)
        const img = calculateDisplacementMap2(state.width, state.height, state.radius, state.bezelWidth, maxAbs, disp1D);
        // 4) Push to filter
         
        if (cache.dispUrl) URL.revokeObjectURL(cache.dispUrl);

        cache.dispUrl = await imageDataToBlobURL(img);
        cache.dispKey = dispKey;
        cache.dispImg = img;
        const feMap = document.querySelector('feImage[result="map"]') as SVGFEImageElement | null;
        if (feMap && cache.dispUrl) feMap.setAttribute('href', cache.dispUrl);
     
    }

    // bezel mask cache
    const maskKey = JSON.stringify({ w: state.width, h: state.height, r: state.radius, b: state.bezelWidth });
    if (cache.maskKey !== maskKey) {
        const maskImg = buildBezelMaskImage(state.width, state.height, state.radius, state.bezelWidth);

        if (cache.maskUrl) URL.revokeObjectURL(cache.maskUrl);
        
        cache.maskUrl = await imageDataToBlobURL(maskImg);
        cache.maskKey = maskKey;
        const bm = document.getElementById('bezelMask') as SVGImageElement | null;
        if (bm && cache.maskUrl) bm.setAttribute('href', cache.maskUrl);
    }
   
    // drive dispersion offsets and base displacement scale
    driveRgbOffsets(state);
    const dispEl = document.getElementById('disp');
    if (dispEl) { 
        dispEl.setAttribute('xChannelSelector', 'R'); 
        dispEl.setAttribute('yChannelSelector', 'G'); 
        dispEl.setAttribute('scale', String(state.scale_px)); 
    }

    // specular image cache
    const specKey = JSON.stringify({
        w: state.width, h: state.height, 
        r: state.radius, b: state.bezelWidth, 
        a: state.specularAngleDeg, s: state.specularStrength, 
        on: state.showSpecular 
    });
    if (cache.specKey !== specKey) {
        if (cache.specUrl) { URL.revokeObjectURL(cache.specUrl); cache.specUrl = null; }

        if (state.showSpecular) {
            const specImg = buildSpecularImage(state.width, state.height, state.radius, state.bezelWidth, state.specularAngleDeg, state.specularStrength);
            cache.specUrl = await imageDataToBlobURL(specImg);
        }
        
        cache.specKey = specKey;
        const specImgEl = document.getElementById('specImage') as SVGImageElement | null;
        if (specImgEl) specImgEl.setAttribute('href', cache.specUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
        const specGain = document.getElementById('specGain') as SVGComponentTransferFunctionElement | null;
        if (specGain) specGain.setAttribute('slope', '1');
    }

    // sat boost over refrWithDisp, gated by bezel
    driveSaturation(state);

    // blur and CSS vars
    const blurEl = document.querySelector('feGaussianBlur[in="out"]');
    if (blurEl) blurEl.setAttribute('stdDeviation', state.frost ? '0.7' : '0');

    const F0 = ((state.refractiveIndex - 1) / (state.refractiveIndex + 1)) ** 2;
    gsap.set(document.documentElement, {
        '--width': state.width, '--height': state.height, '--radius': state.radius,
        '--frost': state.frost, '--saturation': state.saturation, '--F0': F0
    });
    document.documentElement.dataset.debug = String(!!state.debug);

    
    // debug overlay
    if (state.debug && debugRoot) {
        debugRoot.innerHTML = ''

        // Use the cached displacement image, or quickly rebuild a tiny one
        let dbgImg = cache.dispImg
        if (!dbgImg) {
            const disp1D = calculateDisplacementMap(state.glassThickness, state.bezelWidth, surf, state.refractiveIndex, 256)
            const maxAbs = disp1D.reduce((m, v) => Math.max(m, Math.abs(v)), 1)
            dbgImg = calculateDisplacementMap2(
            Math.max(160, Math.floor(state.width  * 0.5)),
            Math.max(120, Math.floor(state.height * 0.5)),
            Math.max(10,  Math.floor(state.radius * 0.5)),
            Math.max( 1,  Math.floor(state.bezelWidth * 0.5)),
            maxAbs, disp1D
            )
        }

        // Image preview
        const c = document.createElement('canvas'); c.width = dbgImg.width; c.height = dbgImg.height
        const ctx = c.getContext('2d'); if (ctx) ctx.putImageData(dbgImg, 0, 0)
        c.style.width  = state.width  + 'px'
        c.style.height = state.height + 'px'
        c.className = 'displacement-image'
        debugRoot.appendChild(c)
 
        // Vector arrows overlay
        const arrows = drawArrowsFromRG(dbgImg, 18, 15)
        arrows.style.width='100%'; arrows.style.height='100%'; arrows.style.position='absolute'; arrows.style.inset='0'
        debugRoot.appendChild(arrows)

        // Surface plot (guard existence)
        if (typeof drawSurfacePlot === 'function') {
            const surfPlot = drawSurfacePlot(surf, state.bezelWidth, state.glassThickness)
            surfPlot.style.position='absolute'; surfPlot.style.left='50%'; surfPlot.style.top='calc(100% + 8px)'; surfPlot.style.translate='-50% 0'
            debugRoot.appendChild(surfPlot)
        }

        // Specular preview overlay (optional)
        if (state.showSpecular) {
            const sImg = buildSpecularImage(state.width, state.height, state.radius, state.bezelWidth, state.specularAngleDeg, state.specularStrength)
            const sC = document.createElement('canvas')
            sC.width = sImg.width; sC.height = sImg.height
            const sg = sC.getContext('2d'); if (sg) sg.putImageData(sImg, 0, 0)
            sC.style.width = state.width + 'px'
            sC.style.height = state.height + 'px'
            sC.style.position = 'absolute'
            sC.style.inset = '0'
            sC.style.mixBlendMode = 'screen'
            sC.style.opacity = '0.9'
            debugRoot.appendChild(sC)
        }
    }
} 