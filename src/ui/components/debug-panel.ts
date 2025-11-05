import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { consume } from '@lit/context';
import { uiStateCtx, UIStateStore } from '../../lib/state/ui-state';
import {
  drawArrowsFromRG,
  drawSurfacePlot,
  calculateDisplacementMap,
  calculateDisplacementMap2,
  SURFACE_FNS,
  asSurfaceKind,
} from '../../lib/glass/index.ts';
import { ref } from 'lit/directives/ref.js';

@customElement('debug-panel')
export class DebugPanel extends LitElement {
    static styles = css`
    :host { display:block; margin-top:1rem }
    .wrap { display:grid; gap:0.75rem; grid-template-columns: 1fr auto; align-items:start }
    .label { font: 600 12px/1 system-ui; opacity:0.7 }
    .stack { position:relative; inline-size:fit-content; overflow:hidden }
    canvas { display:block; max-width:100%; image-rendering: pixelated }
    canvas.overlay { position:absolute; inset:0; pointer-events:none; z-index:1 }
  `;
    private static readonly DISABLE_DISP = false;

    // consume UI state so scale/size updates re-render
    @consume({ context: uiStateCtx }) store?: UIStateStore;
    private debugOn = false;

    private w = 0;
    private h = 0;
    private r = 0;

    // three targets
    private dispEl?: HTMLCanvasElement;
    private arrowsEl?: HTMLCanvasElement;
    private surfaceEl?: HTMLCanvasElement;
    // scratch buffer used only for putImageData
    private scratch?: HTMLCanvasElement;

    private lastFrame?: {
        disp?: ImageData; spec?: ImageData;
        width: number; height: number;
        radius: number; bezelPx: number; glassPx: number;
        surface: string; scalePx: number; refractiveIndex: number;
        debug: boolean;
    };


    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('glass:debug-frame', this.onFrame as EventListener);
    }
    disconnectedCallback() {
        window.removeEventListener('glass:debug-frame', this.onFrame as EventListener);
        super.disconnectedCallback();
    }

    private onFrame = (e: Event) => {
        const { detail } = e as CustomEvent<{
            disp?: ImageData; spec?: ImageData;
            width: number; height: number;
            radius: number; bezelPx: number; glassPx: number;
            surface: string; scalePx: number; refractiveIndex: number;
            debug: boolean;
        }>;

        this.w = detail.width; this.h = detail.height; this.r = detail.radius;
        const scalePx = detail.scalePx ?? this.store?.value.scale_px ?? 1;

        this.lastFrame = {
            disp: detail.disp,
            spec: detail.spec,
            width: detail.width,
            height: detail.height,
            radius: detail.radius,
            bezelPx: detail.bezelPx,
            glassPx: detail.glassPx,
            surface: detail.surface,
            scalePx,
            refractiveIndex: detail.refractiveIndex,
            debug: detail.debug
        };
        this.dispCache = undefined;     
        
        if (typeof detail.debug === 'boolean' && detail.debug !== this.debugOn) {
            this.debugOn = detail.debug;
            this.requestUpdate();
            if (!this.debugOn) { 
                this.dispCache = undefined; 
                this.dispEl?.getContext('2d')?.clearRect(0, 0, this.dispEl.width, this.dispEl.height);
                this.arrowsEl?.getContext('2d')?.clearRect(0, 0, this.arrowsEl.width, this.arrowsEl.height);
                this.surfaceEl?.getContext('2d')?.clearRect(0, 0, this.surfaceEl.width, this.surfaceEl.height);
                return;  
            }
        }
        // draw
        this.renderDisp();
        this.renderArrows();
        this.renderSurface();
    };

    protected updated() {
        if (!this.store || !this.lastFrame) return;

        let changed = false;

        // scale_px affects arrows length
        const s = this.store.value.scale_px;
        if (Math.abs(this.lastFrame.scalePx - s) > 1e-6) {
            this.lastFrame.scalePx = s;
            changed = true;
        }

        // glassThickness influences arrow thicknessGain
        const gt = this.store.value.glassThickness;
        if (Math.abs(this.lastFrame.glassPx - gt) > 1e-6) {
            this.lastFrame.glassPx = gt;
            changed = true;
        }

        // width/height edits resize canvases
        if (this.store.value.width !== this.w || this.store.value.height !== this.h || this.store.value.radius !== this.r) {
            this.w = this.store.value.width;
            this.h = this.store.value.height;
            this.r = this.store.value.radius;
            changed = true;
        }

        if (changed) {
            this.dispCache = undefined;  
            this.renderDisp();     // keeps buffers sized
            this.renderArrows();   // recompute step with new size/scale
            this.renderSurface();  // bezel/glass may have changed
        }
    }

    // --- drawing helpers ---
    private setCanvasSize(el: HTMLCanvasElement, cssW: number, cssH: number, cssR: number) {
        el.style.width = `${cssW}px`;
        el.style.height = `${cssH}px`;
        el.style.borderRadius = `${cssR}px`;
        if (el.width !== cssW) el.width = cssW;
        if (el.height !== cssH) el.height = cssH;
    }

    private getBezelRatio(f: NonNullable<DebugPanel['lastFrame']>): number {
        // clamps between 0 and 1
        const rel = (f.bezelPx ?? 0) / Math.max(1, f.radius ?? 1);
        return Math.min(1, Math.max(0, rel));
    }

    private renderDisp() {
        const f = this.lastFrame;
        if (!this.dispEl) return;

        // keep sizing behavior
        const cssW = this.w || f?.width || 0;
        const cssH = this.h || f?.height || 0;
        const cssR = this.r || f?.radius || 0;
        this.setCanvasSize(this.dispEl, cssW, cssH, cssR);

        if (!f || DebugPanel.DISABLE_DISP) {
            this.dispEl.getContext('2d')!.clearRect(0, 0, this.dispEl.width, this.dispEl.height);
            return;
        }

        // shared displacement map
        const { vecImg } = this.ensureDispMaps(f);

        // ensure scratch matches shared map dims
        if (!this.scratch) this.scratch = document.createElement('canvas');
        if (this.scratch.width !== vecImg.width) this.scratch.width = vecImg.width;
        if (this.scratch.height !== vecImg.height) this.scratch.height = vecImg.height;

        // apply same visualization transform as before to RG channels
        const sctx = this.scratch.getContext('2d', { willReadFrequently: true })!;
        const src = vecImg.data;
        const out = new Uint8ClampedArray(src.length);

        const scale = Math.max(0, f.scalePx || 1);
        const thickness = Math.max(0, f.glassPx || 0);
        const thicknessNorm = thickness > 0 ? thickness / 80 : 0;
        const factor = scale * thicknessNorm || 0;

        for (let i = 0; i < src.length; i += 4) {
            const r = src[i], g = src[i + 1];
            const rx = Math.round(128 + (r - 128) * (factor || 1));
            const gy = Math.round(128 + (g - 128) * (factor || 1));
            out[i] = rx < 0 ? 0 : rx > 255 ? 255 : rx;
            out[i + 1] = gy < 0 ? 0 : gy > 255 ? 255 : gy;
            out[i + 2] = src[i + 2];
            out[i + 3] = src[i + 3];
        }
        sctx.putImageData(new ImageData(out, vecImg.width, vecImg.height), 0, 0);

        const dctx = this.dispEl.getContext('2d')!;
        dctx.clearRect(0, 0, this.dispEl.width, this.dispEl.height);
        dctx.drawImage(this.scratch, 0, 0, this.dispEl.width, this.dispEl.height);

        // keep spec overlay behavior if present
        if (f.spec) {
            const specCv = document.createElement('canvas');
            specCv.width = f.spec.width; specCv.height = f.spec.height;
            const sg = specCv.getContext('2d')!;
            sg.putImageData(f.spec, 0, 0);
            dctx.save();
            dctx.globalCompositeOperation = 'screen';
            dctx.globalAlpha = 0.7;
            dctx.drawImage(specCv, 0, 0, this.dispEl.width, this.dispEl.height);
            dctx.restore();
        }
    }

    private renderArrows() {
        const f = this.lastFrame;
        if (!f || !this.arrowsEl) return;

        this.setCanvasSize(this.arrowsEl, this.w, this.h, this.r);

        // use shared maps
        const { vecImg } = this.ensureDispMaps(f);

        const stepVis = Math.max(20, Math.round(Math.min(this.w, this.h) / 12));
        const lengthBase = 0.5;
        const thicknessNorm = Math.min(1, (f.glassPx > 0 ? f.glassPx / 120 : 0));

        drawArrowsFromRG(vecImg, {
            step: stepVis,
            scalePx: lengthBase * (f.scalePx ?? 1),
            thicknessGain: 1 + 0.7 * thicknessNorm,
            mode: 'arrow',
            alpha: 0.9,
            colorize: true,
            out: this.arrowsEl!
        });
    }

    private renderSurface() {
        const f = this.lastFrame;
        if (!f || !this.surfaceEl) return;
        const kind = asSurfaceKind(f.surface);
        const fn = SURFACE_FNS[kind].fn;
        const src = drawSurfacePlot(fn, f.bezelPx, f.glassPx); // offscreen
        if (this.surfaceEl.width !== src.width) this.surfaceEl.width = src.width;
        if (this.surfaceEl.height !== src.height) this.surfaceEl.height = src.height;
        const g = this.surfaceEl.getContext('2d')!;
        g.clearRect(0, 0, this.surfaceEl.width, this.surfaceEl.height);
        g.drawImage(src, 0, 0);
    }

    private dispCache?: {
        key: string;
        vecImg: ImageData;
        maxAbs: number;
    };
 
    private buildDispKey(f: NonNullable<DebugPanel['lastFrame']>, dims: {w:number;h:number;r:number;b:number}) {
        return [
            f.surface, f.refractiveIndex, f.glassPx, f.bezelPx,
            dims.w, dims.h, dims.r, dims.b
        ].join('|');
    }
 
    private ensureDispMaps(f: NonNullable<DebugPanel['lastFrame']>) {
        // consistent output dims for both disp + arrows
        const rel = this.getBezelRatio(f);   
        const outW = Math.max(160, Math.floor((this.w || f.width) * 0.5));
        const outH = Math.max(120, Math.floor((this.h || f.height) * 0.5));
        const outR = Math.max(10,  Math.floor((this.r || f.radius) * 0.5));
        const outBezel = Math.max(1, Math.floor(outR * rel));

        const key = this.buildDispKey(f, { w: outW, h: outH, r: outR, b: outBezel });
        if (this.dispCache?.key === key) return this.dispCache;

        const surfFn = SURFACE_FNS[asSurfaceKind(f.surface)].fn;
        const bezelPx_for1D = Math.max(1, Math.floor(f.radius * rel)); 

        const disp1D = calculateDisplacementMap(
        f.glassPx, bezelPx_for1D, surfFn, f.refractiveIndex, 256
        );
        const maxAbs = disp1D.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
        const vecImg = calculateDisplacementMap2(
        outW, outH, outR, outBezel, maxAbs, disp1D
        );

this.dispCache = { key, vecImg, maxAbs };
return this.dispCache;
    }

    render() {
        if (!this.debugOn) return html``;

        return html`
      <div class="wrap" aria-live="polite">
        <div>
          <div class="label">Displacement map</div>
          <div class="stack">
            <canvas ${ref((el: any) => (this.dispEl = el as HTMLCanvasElement))}></canvas>
            <canvas class="overlay" ${ref((el: any) => (this.arrowsEl = el as HTMLCanvasElement))}></canvas>
          </div>
        </div>
        <div>
            <div class="label">Surface vs bezel/glass</div>
            <canvas ${ref((el: any) => (this.surfaceEl = el as HTMLCanvasElement))}></canvas>
        </div>
      </div>
    `;
    }
}
