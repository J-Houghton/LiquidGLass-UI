import { LitElement, html } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { generateUniqueFilterId } from './liquid-glass-filter.js';

const DEFAULT_CONTAINER_FILTER_ID = 'lg-container-filter';
/**
 * `<liquid-glass-container>` combines a liquid glass filter definition with a
 * convenient overlay.  It positions itself using the provided width, height
 * and radius and applies a translucent frosted backdrop using the generated
 * filter.  The element does not capture pointer events, allowing
 * interaction to pass through to elements underneath.
 *
 * All optical parameters are forwarded to an internal `<liquid-glass-filter>`.
 */
@customElement('liquid-glass-container')
export class LiquidGlassContainer extends LitElement {
  // Render into light DOM so that the nested filter is globally visible
  protected createRenderRoot() { return this; }

  /** Unique id for the nested filter definition.  This id is referenced by
   * the backdrop-filter on the overlay. */
@property({ type: String, attribute: 'filter-id' }) filterId = DEFAULT_CONTAINER_FILTER_ID;

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

  // Geometry and material properties mirrored to the internal filter
  @property({ type: Number }) width = 300;
  @property({ type: Number }) height = 120;
  @property({ type: Number }) radius = 60;
  @property({ type: Number, attribute: 'bezel-width' }) bezelWidth = 60;
  @property({ type: Number, attribute: 'glass-thickness' }) glassThickness = 50;
  @property({ type: String }) surface: string = 'convex_squircle';
  @property({ type: Number, attribute: 'refractive-index' }) refractiveIndex = 1.5;
  @property({ type: Number, attribute: 'scale-px' }) scalePx = 180;
  @property({ type: Number }) dispersion = 0;
  @property({ type: String, attribute: 'blur-kind' }) blurKind: 'gauss' | 'noise1' | 'noise2' = 'gauss';
  @property({ type: Number, attribute: 'blur-std-dev' }) blurStdDev = 0.2;
  @property({ type: Boolean, attribute: 'show-specular' }) showSpecular = true;
  @property({ type: Number, attribute: 'specular-angle-deg' }) specularAngleDeg = 60;
  @property({ type: Number, attribute: 'specular-strength' }) specularStrength = 0.9;
  @property({ type: Number, attribute: 'disp-r' }) disp_r = 0;
  @property({ type: Number, attribute: 'disp-g' }) disp_g = 0;
  @property({ type: Number, attribute: 'disp-b' }) disp_b = 0;

  /** Frost overlay opacity.  A value between 0 and 1. */
  @property({ type: Number }) frost = 0.05;
  /** Saturation multiplier applied to the backdrop. */
  @property({ type: Number }) saturation = 1;

  /**
   * The component does not perform any custom update cycle – the nested
   * `<liquid-glass-filter>` takes care of image generation based on the
   * forwarded properties.  Here we simply compute inline styles and render
   * the container and overlay.
   */
  protected render() {
        const filterId = this.resolvedFilterId = this.resolveFilterId();
    const containerStyle = `position:relative; display:block; width:${this.width}px; height:${this.height}px; border-radius:${this.radius}px;`;
    const overlayStyle = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      `background: rgba(255,255,255,${this.frost})`,
      `backdrop-filter: url(#${filterId}) saturate(${this.saturation})`,
      `-webkit-backdrop-filter: url(#${filterId}) saturate(${this.saturation})`,
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
        .blurKind=${this.blurKind}
        .blurStdDev=${this.blurStdDev}
        .showSpecular=${this.showSpecular}
        .specularAngleDeg=${this.specularAngleDeg}
        .specularStrength=${this.specularStrength}
        .disp_r=${this.disp_r}
        .disp_g=${this.disp_g}
        .disp_b=${this.disp_b}
      ></liquid-glass-filter>
      <div style="${overlayStyle}"></div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-glass-container': LiquidGlassContainer;
  }
}