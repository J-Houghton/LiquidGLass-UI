import {LitElement, html, css} from 'lit';
import type { ReactiveControllerHost} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
 
import { RafController } from './controllers/raf.js';
import { FilterGraph } from './controllers/filter-graph.js';
import { rebuildDisplacementIfNeeded, rebuildSpecularIfNeeded } from './services/images.js';
import { applyCssVars as applyCssVarsUtil } from './utils/css-vars.js';

import { SURFACE_FNS, asSurfaceKind } from './optics/surfaces.js';
import { buildSpecularImage } from './optics/specularLight.js';
import { calculateDisplacementMap } from './optics/disp1d.js';
import { calculateDisplacementMap2 } from './optics/disp2d.js';

import { validate } from './validation/geometry.js';
import type { Validated } from './validation/geometry.js';

import { DragController } from './controllers/drag.js';
// import type { UIState } from './UI/pane';
import {consume} from '@lit/context';     
import { UIStateStore, uiStateCtx } from '../state/ui-state.js';
import type { UIState } from '../state/ui-state.js';
 
@customElement('glass-container')
export class GlassContainer extends LitElement {
    static styles = css`
        :host {
            display: block;
            position: fixed;
            cursor:grab; 
            z-index: 9999;
            width: var(--width, 0px); 
            height: var(--height, 0px);      
            border-radius: calc(var(--radius) * 1px);   
            contain: layout paint size;
        } 
        :host([dragging]) { cursor:grabbing; }
        .effect {  
            position: absolute;
            inset: 0;
            left: 0; 
            top: 0;  
            z-index: 999;
            /* frost overlay uses alpha from --frost */
            background: light-dark(
                hsl(0 0% 100% / var(--frost, 0)),
                hsl(0 0% 0% / var(--frost, 0))
            );
            /* saturation applied to backdrop */
            backdrop-filter: url(#filter) saturate(var(--saturation, 1));
            -webkit-backdrop-filter: url(#filter) saturate(var(--saturation, 1)); /* Safari */

            will-change: backdrop-filter, transform; 
            backface-visibility: hidden;             
            contain: paint;                          
            transform: translateZ(0);
        }
        .filter {
            width: 100%;
            height: 100%;
            pointer-events: none;
            position: absolute;
            inset: 0;
        }
        [data-debug='true'] .displacement-debug {
            translate: 0 calc(100% + 1rem);
            scale: 1;
            opacity: 1;
            z-index: 1001;   
        }

        .displacement-debug {
            pointer-events: none;
            height: 100%;
            width: 100%;
            position: absolute;
            inset: 0;
            translate: 0 calc(200% + 1rem);
            scale: 0.8;
            opacity: 0;
            transition-property: translate, opacity, scale;
            transition-duration: 0.26s;
            transition-timing-function: ease-out;
            z-index: 1000;     
        } 
        .displacement-debug .label {
        position: absolute;
        left: 50%;
        top: calc(100% + 0.2lh);
        }
        .displacement-debug span {
            display: inline-block;
            font-size: 0.875rem;
            font-family: 'Gloria Hallelujah', cursive;
            padding: 0.5rem 0.75rem;
            background: color-mix(in oklch, canvas, #0000 25%);
            backdrop-filter: blur(4px);
            border-radius: 6px;
            white-space: nowrap;
        }

        .displacement-debug svg {
            position: absolute;
            filter: drop-shadow(0 2px 10px canvas);
            right: 100%;
            rotate: 40deg;
            translate: 25% 60%;
            scale: -1 1;
            width: 40px;
        } 

        .displacement-debug .displacement-image {
            height: 100%;
            width: 100%;
            pointer-events: none;
            border-radius: calc(var(--radius) * 1px);
        }
    `;
    constructor() {
        super();
        void this.drag;
        void this.raf;
    }
    @property() classes = { effect: true, bgClass: false };  
    @query('feImage[result="map"]') private feMap!: SVGFEImageElement;
    @query('#disp') private dispEl!: SVGFEDisplacementMapElement;
    @query('#specImage') private specImgEl!: SVGImageElement;
    //@query('#debugRoot') private debugRoot!: HTMLDivElement; 
    @consume({context: uiStateCtx})                                       // <-- Simpler
    store?: UIStateStore;                                                 // <-- Optional until provided
    private _unsub?: () => void;                                          // <-- ADDED
    private _fallback = {                                                 // <-- ADDED fallback state
        width:300, height:120, radius:60,
        refractiveIndex:1.5, glassThickness:50,
        bezelWidth:60, scale_px:180, dispersion:0,
        surface: 'convex_squircle', frost:0.05, saturation:1, debug:false,
        blurStdDev:0.2, blurKind:'gauss' as const,
        showSpecular:true, specularAngleDeg:60, specularStrength:0.9,
        r:1.0, g:0.25, b:-1.0,
    };
    private get state() { return this.store?.value ?? this._fallback; }  
    private _debugLayer?: HTMLDivElement;    
    private _debugKey = '';    
    private _lastCss = { width: 0, height: 0, radius: 0, frost: 0, sat: 0, F0: 0 }; 

    // private _dbgCanvas?: HTMLCanvasElement;      
    // private _arrowsCanvas?: HTMLCanvasElement;   
    // private _specCanvas?: HTMLCanvasElement;     
    private _dispCacheKey = '';                  
    private _dispCached?: ImageData;  

    private drag = new DragController(this as unknown as HTMLElement & ReactiveControllerHost, {
        clampToViewport: true
    }); 
    set dragging(v: boolean) {
        if (v) this.setAttribute('dragging', '');
        else this.removeAttribute('dragging');
    } 

    /* ===== Config ===== */     
    private raf = new RafController(this, () => this._tick());
    private graph = new FilterGraph(this);
 
    protected firstUpdated() {
        this.graph.hydrateRefs();
        // Subscribe once the store exists
        queueMicrotask(() => {
        if (this.store && !this._unsub) {
            this._unsub = this.store.subscribe(() => this.requestUpdate()); // <-- ADDED
        }
        });
    }
    connectedCallback() {                                         // ← ADDED
        super.connectedCallback?.();
        this._debugLayer = document.createElement('div');
        Object.assign(this._debugLayer.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            width: '0px',
            height: '0px',
            pointerEvents: 'none',
            zIndex: '2147483647',   // max 32-bit int
        });
        this._debugLayer.id = 'glass-debug-overlay';
        document.body.appendChild(this._debugLayer);
        }
    disconnectedCallback() {                                              // <-- ADDED
        super.disconnectedCallback?.();
        this._unsub?.();
        this._unsub = undefined;
        if (this._debugLayer?.parentNode) this._debugLayer.parentNode.removeChild(this._debugLayer); // ← CHANGED
  this._debugLayer = undefined;
    }
    
    protected updated() {                                                 // <-- ADDED
        if (this.store && !this._unsub) {
            this._unsub = this.store.subscribe(() => this.requestUpdate());
        }
    }
    public updateFromConfig(cfg: Partial<UIState>) {
        Object.assign(this.state, cfg); 
        this.requestUpdate(); 
    }

    private _tick = async () => {    
        const v = this.computeValidated();

        await rebuildDisplacementIfNeeded(v, { refractiveIndex: this.state.refractiveIndex, surface: asSurfaceKind(this.state.surface) }, this.feMap);
        this.updateDisplacementElement();
        await rebuildSpecularIfNeeded(v, {
            specularAngleDeg: this.state.specularAngleDeg,
            specularStrength: this.state.specularStrength,
            showSpecular: this.state.showSpecular,
        }, this.specImgEl);

        this.graph.buildIfNeeded({
            dispersion: this.state.dispersion,
            blurKind: this.state.blurKind,
            showSpecular: this.state.showSpecular,
            blurStdDev: this.state.blurStdDev,
            specularStrength: this.state.specularStrength, 
        });
        this.graph.updateParams({
            blurStdDev: this.state.blurStdDev,
            blurKind: this.state.blurKind,    
            specularStrength: this.state.specularStrength,
            scale_px: this.state.scale_px,
            dispersion: this.state.dispersion,  
        });
        
        this.graph.updateFilterRes(v.width, v.height); 
        applyCssVarsUtil(this, v, this.state, this._lastCss);
        //if (!this.state.debug || !this.debugRoot) { this.debugRoot.innerHTML = ''; return; }
         this.buildDebugFrame(v);
    }
    private computeValidated():Validated {
      const v = validate({
        width: this.state.width,
        height: this.state.height,
        radius: this.state.radius,
        bezelWidth: this.state.bezelWidth,
        glassThickness: this.state.glassThickness,
        surface: asSurfaceKind(this.state.surface),
      });
      return v;
    } 

    private updateDisplacementElement() {
        if (this.dispEl) {
          this.dispEl.setAttribute('xChannelSelector', 'R');
          this.dispEl.setAttribute('yChannelSelector', 'G');
          this.dispEl.setAttribute('scale', String(this.state.scale_px));
        }
    } 
    
    private _specCached?: ImageData;                 // <- add cache
    private buildDebugFrame(v: Validated) {
        const debug = this.state.debug;
        const key = JSON.stringify({
            w:v.width,h:v.height,r:v.radius,b:v.bezelWidth,
            n:this.state.refractiveIndex, s:this.state.surface,
            a:this.state.specularAngleDeg, p:this.state.specularStrength,
            d:this.state.dispersion
        });

        // build reduced displacement only if key changed
        if (debug && key !== this._dispCacheKey) {                                      // <-- CHANGED
            const disp1D = calculateDisplacementMap(
                v.glassThickness_eff, v.bezelWidth, SURFACE_FNS[asSurfaceKind(this.state.surface)].fn,
                this.state.refractiveIndex, 256
            );
            const maxAbs = disp1D.reduce((m, val) => Math.max(m, Math.abs(val)), 1);
            this._dispCached = calculateDisplacementMap2(
                Math.max(160, Math.floor(v.width * 0.5)),
                Math.max(120, Math.floor(v.height * 0.5)),
                Math.max(10, Math.floor(v.radius * 0.5)),
                Math.max(1, Math.floor(v.bezelWidth * 0.5)),
                maxAbs, disp1D
            );
            this._dispCacheKey = key;
       } 
        // optional: build specular preview data once per key
        if (debug && this.state.showSpecular && key !== this._debugKey) {
            const sImg = buildSpecularImage(
              v.width, v.height, v.radius, v.bezelWidth,
              this.state.specularAngleDeg, this.state.specularStrength
            );
            this._specCached = sImg;
          }
          this._debugKey = key;
          
          // emit a frame for the debug panel to render
          window.dispatchEvent(new CustomEvent('glass:debug-frame', {
            detail: {
              disp: debug ? this._dispCached : undefined,
             spec: debug ? (this.state.showSpecular ? this._specCached : undefined) : undefined, 
              width: this.state.width, 
              height: this.state.height,
              radius: this.state.radius,
              bezelPx: this.state.bezelWidth,
              glassPx: this.state.glassThickness,
              surface: this.state.surface,
              key, 
              refractiveIndex: this.state.refractiveIndex,
              scalePx: this.state.scale_px,
              debug 
            },
            bubbles: false,
            composed: false
          }));
  } 
  protected render() { 
    return html`  
        <div class=${classMap(this.classes)} >
            <svg class="filter" xmlns="http://www.w3.org/2000/svg">
                <defs> 
                    <filter id="filter" filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"> 
                        <!-- displacement field -->
                        <feImage x="0" y="0" width="100%" height="100%" result="map"></feImage> 
                        <!-- refraction -->
                        <feDisplacementMap in="SourceGraphic" in2="map" id="disp" xChannelSelector="R" yChannelSelector="G" scale="0" result="refr" />
                        <!-- specular highlight image -->
                        <feImage x="0" y="0" width="100%" height="100%" id="specImage" result="specSrc"></feImage>
                    </filter>
                </defs>
            </svg>
        </div> 
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'glass-container': GlassContainer;
  }
}
