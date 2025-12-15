import { LitElement, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { FilterGraph } from './filterGraph.js'; 
import { rebuildDisplacementIfNeeded, rebuildSpecularIfNeeded } from '../core/images.js';
import { cache } from '../core/fx/filterCache.js';
import { asSurfaceKind } from '../core/optics/surfaces.js';
import { validate, type Validated } from '../core/validation/geometry.js';
import type { PropertyValues } from 'lit';

export const DEFAULT_FILTER_ID = 'liquid-glass-filter';

let uniqueIdCounter = 0;

export function generateUniqueFilterId(prefix: string = DEFAULT_FILTER_ID): string {
  uniqueIdCounter += 1;
  return `${prefix}-${uniqueIdCounter}`;
}

export function isDefaultFilterId(value: string | null | undefined): boolean {
  return value == null || value === '' || value === DEFAULT_FILTER_ID;
}

@customElement('liquid-glass-filter')
export class LiquidGlassFilter extends LitElement {
  protected createRenderRoot() { return this; }

  @property({ type: String, attribute: 'filter-id' }) filterId = DEFAULT_FILTER_ID;
  @query('filter') private filterEl!: SVGFilterElement; 
  
  @property({ type: String }) surface: string = 'convex_squircle';
  @property({ type: Number, attribute: 'refractive-index' }) refractiveIndex = 1.5;
  @property({ type: Number, attribute: 'glass-thickness' }) glassThickness = 50;
  @property({ type: Number, attribute: 'bezel-width' }) bezelWidth = 60;
  @property({ type: Number, attribute: 'scale-px' }) scalePx = 180;
  @property({ type: String, attribute: 'blur-kind' }) blurKind: 'gauss' | 'noise1' | 'noise2' = 'gauss';
  @property({ type: Number, attribute: 'blur-std-dev' }) blurStdDev = 0.2;

  @property({ type: Boolean, attribute: 'show-specular' }) showSpecular = true;
  @property({ type: Number, attribute: 'specular-angle-deg' }) specularAngleDeg = 60;
  @property({ type: Number, attribute: 'specular-strength' }) specularStrength = 0.9;

  @property({ type: Number }) width = 300;
  @property({ type: Number }) height = 120;
  @property({ type: Number }) radius = 60;
  @property({ type: Number }) saturation = 1;  
  @property({ type: Number }) frost = 0.05; 
 
  @property({ type: Number }) dispersion = 0;
  @property({ type: Number, attribute: 'chromatic-bezel-factor' }) chromaticBezelFactor = 4;

  @query('feImage[result="map"]') private feMap!: SVGFEImageElement;
  @query('feDisplacementMap') private dispEl!: SVGFEDisplacementMapElement;
  @query('feImage[result="specSrc"]') private specImgEl!: SVGImageElement;

  private graph = new FilterGraph(this);
  
  constructor() {
    super();
    this.ensureFilterId();
  }

  connectedCallback() {
    this.ensureFilterId();
    super.connectedCallback();
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has('filterId')) {
      this.ensureFilterId();
    }
    super.willUpdate(changed);
  }

  private ensureFilterId() {
    const attrValue = this.getAttribute('filter-id');
    const candidate = attrValue ?? this.filterId;
    if (isDefaultFilterId(candidate)) {
      const generated = generateUniqueFilterId();
      if (this.filterId !== generated) {
        this.filterId = generated;
      }
      return;
    }
    if (candidate !== this.filterId && candidate != null) {
      this.filterId = candidate;
    }
  }

  private computeValidated(): Validated {
    return validate({
      width: this.width,
      height: this.height,
      radius: this.radius,
      bezelWidth: this.bezelWidth,
      glassThickness: this.glassThickness,
      surface: asSurfaceKind(this.surface),
    });
  }

  protected firstUpdated() {
    this.graph.hydrateRefs();
    void this._updateFilter();
  }

  protected updated() {
    void this._updateFilter();
  }

  private async _updateFilter() {
    const v = this.computeValidated();

    const DPR = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (this.filterEl) {
      this.filterEl.setAttribute('filterRes',
        `${Math.round(this.width * DPR)} ${Math.round(this.height * DPR)}`); 
    }
    await rebuildDisplacementIfNeeded(
      v,
      {
        refractiveIndex: this.refractiveIndex,
        surface: asSurfaceKind(this.surface),
        chromaticBezelFactor: this.chromaticBezelFactor
      },
      this.feMap
    );
    
    // Emit event with the new map URL
    if (cache.dispUrl) {
        this.dispatchEvent(new CustomEvent('displacement-updated', {
            detail: { url: cache.dispUrl },
            bubbles: true,
            composed: true
        }));
    }

    if (this.dispEl) {
      this.dispEl.setAttribute('xChannelSelector', 'R');
      this.dispEl.setAttribute('yChannelSelector', 'G');
      this.dispEl.setAttribute('scale', String(this.scalePx));
    }
    await rebuildSpecularIfNeeded(
      v,
      {
        specularAngleDeg: this.specularAngleDeg,
        specularStrength: this.specularStrength,
        showSpecular: this.showSpecular,
      },
      this.specImgEl
    );
    this.graph.buildIfNeeded({
      dispersion: this.dispersion,
      blurKind: this.blurKind,
      showSpecular: this.showSpecular,
      blurStdDev: this.blurStdDev,
      specularStrength: this.specularStrength,
    });
    this.graph.updateParams({
      blurStdDev: this.blurStdDev,
      blurKind: this.blurKind,
      specularStrength: this.specularStrength,
      scale_px: this.scalePx,
      dispersion: this.dispersion, 
    }); 
  }

  protected render() {
    return html`<svg width=${this.width} height=${this.height} style="position:absolute" aria-hidden="true">
      <defs>
        <filter id=${this.filterId}
            filterUnits="userSpaceOnUse"        
            primitiveUnits="userSpaceOnUse"     
            x="0" y="0"                         
            width=${this.width} height=${this.height}
            color-interpolation-filters="sRGB"> 
           <feImage x="0" y="0" width=${this.width} height=${this.height} preserveAspectRatio="none" result="map"></feImage>
          <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" scale="0" result="refr"></feDisplacementMap>
          <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="specSrc"></feImage>
        </filter>
      </defs>
    </svg>`;
  }
}