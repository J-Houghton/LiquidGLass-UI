import {LitElement, html, css} from 'lit';
import {customElement, query} from 'lit/decorators.js';
import { RafController } from './controllers/raf.js';
import { FilterGraph } from './controllers/filter-graph.js';
import { rebuildDisplacementIfNeeded, rebuildSpecularIfNeeded } from './services/images.js';
import { applyCssVars as applyCssVarsUtil } from './utils/css-vars.js';

import { asSurfaceKind } from './optics/surfaces.js'; 

import { validate } from './validation/geometry.js';
import type { Validated } from './validation/geometry.js';

import {consume} from '@lit/context';
import { UIStateStore, uiStateCtx } from '../state/ui-state.js';
import type { UIState } from '../state/ui-state.js';

@customElement('glass-filter')
export class GlassFilter extends LitElement {
  protected createRenderRoot() { return this; }

  static styles = css`
    :host { display: contents; }             /* no wrapper box */
    svg.filter-root { position:absolute; width:0; height:0; overflow:hidden; }
  `;

  @consume({context: uiStateCtx}) store?: UIStateStore;
  private _unsub?: () => void;

  @query('feImage[result="map"]') private feMap!: SVGFEImageElement;
  @query('#disp') private dispEl!: SVGFEDisplacementMapElement;
  @query('#specImage') private specImgEl!: SVGImageElement;

  private _fallback = {
    width:300, height:120, radius:60,
    refractiveIndex:1.5, glassThickness:50,
    bezelWidth:60, scale_px:180, dispersion:0,
    surface: 'convex_squircle', frost:0.05, saturation:1, debug:false,
    blurStdDev:0.2, blurKind:'gauss' as const,
    showSpecular:true, specularAngleDeg:60, specularStrength:0.9,
    r:1.0, g:0.25, b:-1.0,
  };
  private get state() { return this.store?.value ?? this._fallback; }

  private _lastCss = { width: 0, height: 0, radius: 0, frost: 0, sat: 0, F0: 0 };

  constructor() {
    super();
    void this.raf;
  }

  private raf = new RafController(this, () => this._tick());
  private graph = new FilterGraph(this);

  protected firstUpdated() {
    this.graph.hydrateRefs();
    queueMicrotask(() => {
      if (this.store && !this._unsub) {
        this._unsub = this.store.subscribe(() => this.requestUpdate());
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  protected updated() {
    if (this.store && !this._unsub) {
      this._unsub = this.store.subscribe(() => this.requestUpdate());
    }
    const svgFilter = this.renderRoot?.querySelector('filter');
    if (svgFilter) svgFilter.setAttribute('id', this.filterId);
  }

  private get filterId() { return (this.id && this.id.trim()) + '-filter' || 'glass-filter-default-filter'; }

  public updateFromConfig(cfg: Partial<UIState>) {
    Object.assign(this.state, cfg);
    this.requestUpdate();
  }

  private computeValidated(): Validated {
    return validate({
      width: this.state.width,
      height: this.state.height,
      radius: this.state.radius,
      bezelWidth: this.state.bezelWidth,
      glassThickness: this.state.glassThickness,
      surface: asSurfaceKind(this.state.surface),
    });
  }

  private updateDisplacementElement() {
    if (this.dispEl) {
      this.dispEl.setAttribute('xChannelSelector', 'R');
      this.dispEl.setAttribute('yChannelSelector', 'G');
      this.dispEl.setAttribute('scale', String(this.state.scale_px));
    }
  }

  private async _tick() {
    const v = this.computeValidated();

    await rebuildDisplacementIfNeeded(
      v,
      { refractiveIndex: this.state.refractiveIndex, surface: asSurfaceKind(this.state.surface) },
      this.feMap
    );
    this.updateDisplacementElement();

    await rebuildSpecularIfNeeded(
      v,
      {
        specularAngleDeg: this.state.specularAngleDeg,
        specularStrength: this.state.specularStrength,
        showSpecular: this.state.showSpecular,
      },
      this.specImgEl
    );

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
    
  }

  // CHANGED: template has ONLY the SVG filter; no wrapper <div>
// glass-filter.ts (render())

protected render() {
    return html`
      <svg
        class="filter-root"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        width="300" height="120" 
      >
        <defs>
          <filter
            id="${this.filterId}"
            filterUnits="userSpaceOnUse"     
            x="0" y="0"                      
            width="100%" height="100%"   
            color-interpolation-filters="sRGB"
          >
            <feImage x="0" y="0" width="100%" height="100%" result="map"></feImage>
            <feDisplacementMap in="SourceGraphic" in2="map" id="disp"
                               xChannelSelector="R" yChannelSelector="G"
                               scale="0" result="refr" />
            <feImage x="0" y="0" width="100%" height="100%" id="specImage" result="specSrc"></feImage>
          </filter>
        </defs>
      </svg>
    `;
  }
  
}

declare global {
  interface HTMLElementTagNameMap {
    'glass-filter': GlassFilter;
  }
}
