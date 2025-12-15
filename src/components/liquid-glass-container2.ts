import { LitElement, html } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { generateUniqueFilterId } from './liquid-glass-filter.js';

import { DEFAULT_GLASS_CONTAINER_PARAMS, type GlassContainerParams } from '../core/defaults.js';

const DEFAULT_CONTAINER_FILTER_ID = 'lg-container-filter';

@customElement('liquid-glass-container')
export class LiquidGlassContainer extends LitElement {
  protected createRenderRoot() { return this; }

  @property({ type: String, attribute: 'filter-id' }) filterId = DEFAULT_CONTAINER_FILTER_ID;
  @property({ type: Boolean }) debug = false;

  @state() private _debugMapUrl: string | undefined;

  private resolvedFilterId = DEFAULT_CONTAINER_FILTER_ID;

  constructor() {
    super();
    this.resolvedFilterId = this.resolveFilterId();
  }

  connectedCallback() {
    this.resolvedFilterId = this.resolveFilterId();
    super.connectedCallback();
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has('filterId')) {
      this.resolvedFilterId = this.resolveFilterId();
    }
    super.willUpdate(changed);
  }

  private resolveFilterId(): string {
    const attrValue = this.getAttribute('filter-id');
    const candidate = attrValue ?? this.filterId;
    if (!candidate || candidate === DEFAULT_CONTAINER_FILTER_ID) {
      if (this.resolvedFilterId && this.resolvedFilterId !== DEFAULT_CONTAINER_FILTER_ID) {
        if (this.filterId !== this.resolvedFilterId) {
          this.filterId = this.resolvedFilterId;
        }
        return this.resolvedFilterId;
      }
      const generated = generateUniqueFilterId(DEFAULT_CONTAINER_FILTER_ID);
      if (this.filterId !== generated) {
        this.filterId = generated;
      }
      this.resolvedFilterId = generated;
      return generated;
    }
    if (this.filterId !== candidate) {
      this.filterId = candidate;
    }
    this.resolvedFilterId = candidate;
    return candidate;
  }

  @property({ type: Number }) width = DEFAULT_GLASS_CONTAINER_PARAMS.width;
  @property({ type: Number }) height = DEFAULT_GLASS_CONTAINER_PARAMS.height;
  @property({ type: Number }) radius = DEFAULT_GLASS_CONTAINER_PARAMS.radius;
  @property({ type: Number, attribute: 'bezel-width' }) bezelWidth = DEFAULT_GLASS_CONTAINER_PARAMS.bezelWidth;
  @property({ type: Number, attribute: 'glass-thickness' }) glassThickness = DEFAULT_GLASS_CONTAINER_PARAMS.glassThickness;
  @property({ type: String }) surface: GlassContainerParams['surface'] = DEFAULT_GLASS_CONTAINER_PARAMS.surface;
  @property({ type: Number, attribute: 'refractive-index' }) refractiveIndex = DEFAULT_GLASS_CONTAINER_PARAMS.refractiveIndex;
  @property({ type: Number, attribute: 'scale-px' }) scalePx = DEFAULT_GLASS_CONTAINER_PARAMS.scalePx;
  @property({ type: Number }) dispersion = DEFAULT_GLASS_CONTAINER_PARAMS.dispersion;
  @property({ type: Number, attribute: 'chromatic-bezel-factor' }) chromaticBezelFactor = DEFAULT_GLASS_CONTAINER_PARAMS.chromaticBezelFactor;
  @property({ type: String, attribute: 'blur-kind' }) blurKind: GlassContainerParams['blurKind'] = DEFAULT_GLASS_CONTAINER_PARAMS.blurKind;
  @property({ type: Number, attribute: 'blur-std-dev' }) blurStdDev = DEFAULT_GLASS_CONTAINER_PARAMS.blurStdDev;
  @property({ type: Boolean, attribute: 'show-specular' }) showSpecular = DEFAULT_GLASS_CONTAINER_PARAMS.showSpecular;
  @property({ type: Number, attribute: 'specular-angle-deg' }) specularAngleDeg = DEFAULT_GLASS_CONTAINER_PARAMS.specularAngleDeg;
  @property({ type: Number, attribute: 'specular-strength' }) specularStrength = DEFAULT_GLASS_CONTAINER_PARAMS.specularStrength;

  @property({ type: Number }) frost = DEFAULT_GLASS_CONTAINER_PARAMS.frost;
  @property({ type: Number }) saturation = DEFAULT_GLASS_CONTAINER_PARAMS.saturation;

  private handleMapUpdate(e: CustomEvent<{ url: string }>) {
    this._debugMapUrl = e.detail.url;
  }

  protected render() {
    const filterId = this.resolvedFilterId = this.resolveFilterId();
    const containerStyle = `position:relative; display:block; width:${this.width}px; height:${this.height}px; border-radius:${this.radius}px;`;
    
    // When debug is on, we hide the frost overlay and show the raw map
    const overlayStyle = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      this.debug 
        ? `background-image: url(${this._debugMapUrl}); background-size: cover; opacity: 1; z-index: 100;`
        : `background: hsl(0 0% 0% / ${this.frost}); backdrop-filter: url(#${filterId}) saturate(${this.saturation}); -webkit-backdrop-filter: url(#${filterId}) saturate(${this.saturation});`,
      'border-radius: inherit',
    ].join(';');

    return html`<div style="${containerStyle}">
      <liquid-glass-filter
        .filterId=${filterId}
        .width=${this.width}
        .height=${this.height}
        .radius=${this.radius}
        .bezelWidth=${this.bezelWidth}
        .glassThickness=${this.glassThickness}
        .surface=${this.surface}
        .refractiveIndex=${this.refractiveIndex}
        .scalePx=${this.scalePx}
        .dispersion=${this.dispersion}
        .chromaticBezelFactor=${this.chromaticBezelFactor}
        .blurKind=${this.blurKind}
        .blurStdDev=${this.blurStdDev}
        .showSpecular=${this.showSpecular}
        .specularAngleDeg=${this.specularAngleDeg}
        .specularStrength=${this.specularStrength}
        @displacement-updated=${this.handleMapUpdate}
      ></liquid-glass-filter>
      <div style="${overlayStyle}"></div>
    </div>`;
  }
}