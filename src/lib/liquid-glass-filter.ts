import { LitElement, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { FilterGraph } from './filterGraph.js';
import { rebuildDisplacementIfNeeded, rebuildSpecularIfNeeded } from './images.js';
import { asSurfaceKind } from './optics/surfaces.js';
import { validate, type Validated } from './validation/geometry.js';
import type { PropertyValues } from 'lit';

/** Default `filter-id` used as a sentinel before a unique id is assigned. */
export const DEFAULT_FILTER_ID = 'liquid-glass-filter';

let uniqueIdCounter = 0;

/** Generate a unique filter id, optionally using a custom prefix. */
export function generateUniqueFilterId(prefix: string = DEFAULT_FILTER_ID): string {
  uniqueIdCounter += 1;
  return `${prefix}-${uniqueIdCounter}`;
}

/** Determine whether a supplied id is still the default/sentinel value. */
export function isDefaultFilterId(value: string | null | undefined): boolean {
  return value == null || value === '' || value === DEFAULT_FILTER_ID;
}

/**
 * `<liquid-glass-filter>` defines an SVG filter implementing the liquid
 * glass refraction and reflection effect.  Once instantiated it will
 * generate displacement and specular highlight maps on demand and wire up
 * optional blur, noise and chromatic aberration stages.  To use the filter
 * simply reference its `filter-id` attribute from CSS via
 * `backdrop-filter: url(#<id>)` on any element with a backdrop.
 *
 * Each of the public properties corresponds to a physical parameter of the
 * glass or an artistic adjustment.  Updating a property triggers an
 * asynchronous rebuild of the internal images and updates the filter graph.
 */
@customElement('liquid-glass-filter')
export class LiquidGlassFilter extends LitElement {
  // Avoid creating a shadow DOM wrapper around the SVG so that the filter is
  // defined in light DOM and can be referenced from outside easily.  The
  // default render root would isolate the filter definitions; by returning
  // `this` we ensure the SVG is appended directly under the element.
  protected createRenderRoot() { return this; }

  /** Unique id assigned to the `<filter>` definition.  Must be referenced
   * from CSS using `backdrop-filter: url(#<filter-id>)`. */
  @property({ type: String, attribute: 'filter-id' }) filterId = DEFAULT_FILTER_ID;

  // material
  @property({ type: String }) surface: string = 'convex_squircle';
  @property({ type: Number, attribute: 'refractive-index' }) refractiveIndex = 1.5;
  @property({ type: Number, attribute: 'glass-thickness' }) glassThickness = 50;
  @property({ type: Number, attribute: 'bezel-width' }) bezelWidth = 60;
  @property({ type: Number, attribute: 'scale-px' }) scalePx = 180;
  @property({ type: String, attribute: 'blur-kind' }) blurKind: 'gauss' | 'noise1' | 'noise2' = 'gauss';
  @property({ type: Number, attribute: 'blur-std-dev' }) blurStdDev = 0.2;

  // Specular highlight
  @property({ type: Boolean, attribute: 'show-specular' }) showSpecular = true;
  @property({ type: Number, attribute: 'specular-angle-deg' }) specularAngleDeg = 60;
  @property({ type: Number, attribute: 'specular-strength' }) specularStrength = 0.9;

  // Geometry  
  @property({ type: Number }) width = 300;
  @property({ type: Number }) height = 120;
  @property({ type: Number }) radius = 60;
  // css changes on parent container, might not needed here
  @property({ type: Number }) saturation = 1;  
  @property({ type: Number }) frost = 0.05; // overlay opacity [0..1]
 
  // Chromatic aberration strength; values above zero enable dispersion
  @property({ type: Number }) dispersion = 0; 
  @property({ type: Number, attribute: 'disp-r' }) disp_r = 0;
  @property({ type: Number, attribute: 'disp-g' }) disp_g = 0;
  @property({ type: Number, attribute: 'disp-b' }) disp_b = 0;
  


  // Internal references to filter primitives
  @query('feImage[result="map"]') private feMap!: SVGFEImageElement;
  // Reference the first displacement map element within the filter instead of
  // relying on a hardcoded id.  This allows multiple filters to coexist
  // without id collisions.
  @query('feDisplacementMap') private dispEl!: SVGFEDisplacementMapElement;
  // Reference the specular highlight image via its result name rather than
  // an id to avoid global id collisions.
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

  /** Compute and validate the current shape before feeding it to the optics. */
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
    // Bind filter and displacement references then perform an initial update
    this.graph.hydrateRefs();
    void this._updateFilter();
  }

  protected updated() {
    void this._updateFilter();
  }

  private async _updateFilter() {
    const v = this.computeValidated();
    // Displacement map
    await rebuildDisplacementIfNeeded(
      v,
      { refractiveIndex: this.refractiveIndex, surface: asSurfaceKind(this.surface) },
      this.feMap
    );
    // Update displacement map scaling and channel selectors
    if (this.dispEl) {
      this.dispEl.setAttribute('xChannelSelector', 'R');
      this.dispEl.setAttribute('yChannelSelector', 'G');
      this.dispEl.setAttribute('scale', String(this.scalePx));
    }
    // Specular highlight
    await rebuildSpecularIfNeeded(
      v,
      {
        specularAngleDeg: this.specularAngleDeg,
        specularStrength: this.specularStrength,
        showSpecular: this.showSpecular,
      },
      this.specImgEl
    );
    // Build or adjust filter graph
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
      disp_r: this.disp_r, disp_g: this.disp_g, disp_b: this.disp_b,
    }); 
  }

  /** Render the SVG filter definition.  The filter id is taken from
   * `filterId`.  Consumers should reference it via CSS.  The SVG itself is
   * hidden from view via zero dimensions and absolute positioning. */
  protected render() {
    return html`<svg width=${this.width} height=${this.height} style="position:absolute" aria-hidden="true">
      <defs>
        <filter id=${this.filterId} filterUnits="objectBoundingBox" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
          <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"></feImage>
          <!-- The displacement map no longer uses a global id; rely on query selection instead -->
          <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" scale="0" result="refr"></feDisplacementMap>
          <!-- Specular highlight source: result="specSrc" for later lookup -->
          <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="specSrc"></feImage>
        </filter>
      </defs>
    </svg>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-glass-filter': LiquidGlassFilter;
  }
}