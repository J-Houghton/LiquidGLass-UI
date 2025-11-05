import {LitElement, html} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';
import {consume} from '@lit/context';
import {uiStateCtx, UIStateStore} from '../state/ui-state.js';
import {FilterGraph} from './controllers/filter-graph.js';
import {rebuildDisplacementIfNeeded, rebuildSpecularIfNeeded} from './services/images.js';
import {asSurfaceKind} from './optics/surfaces.js';
import {validate, type Validated} from './validation/geometry.js';

@customElement('mini-glass-filter')
export class MiniGlassFilter extends LitElement {
    static override shadowRootOptions: ShadowRootInit = {
        ...LitElement.shadowRootOptions,
        mode: 'open' as const, 
    };

  /** The <filter> id to reference from CSS url(#id) */
  @property({type: String, attribute: 'filter-id'}) filterId = 'preset-filter';

  @consume({context: uiStateCtx}) store?: UIStateStore;

  @query('feImage[result="map"]') private feMap!: SVGFEImageElement;
  @query('#disp') private dispEl!: SVGFEDisplacementMapElement;
  @query('#specImage') private specImgEl!: SVGImageElement;

  private graph = new FilterGraph(this);

  private get state() {
    // Fallback mirrors glass-container defaults
    return this.store?.value ?? {
      width:300, height:120, radius:60,
      refractiveIndex:1.5, glassThickness:50,
      bezelWidth:60, scale_px:180, dispersion:0,
      surface:'convex_squircle', frost:0.05, saturation:1, debug:false,
      blurStdDev:0.2, blurKind:'gauss' as const,
      showSpecular:true, specularAngleDeg:60, specularStrength:0.9,
      r:1.0, g:0.25, b:-1.0,
    };
  }

  protected firstUpdated() {
    this.graph.hydrateRefs();
    this.requestUpdate();
    this.store?.subscribe(() => this._tick());
  }

  protected updated() { this._tick(); }

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

  private async _tick() {
    const v = this.computeValidated();

    await rebuildDisplacementIfNeeded(
      v,
      {refractiveIndex: this.state.refractiveIndex, surface: asSurfaceKind(this.state.surface)},
      this.feMap
    );
    // update disp params that depend on state
    this.dispEl?.setAttribute('xChannelSelector', 'R');
    this.dispEl?.setAttribute('yChannelSelector', 'G');
    this.dispEl?.setAttribute('scale', String(this.state.scale_px));

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
  }

  // Only provides the <filter>. No visual output.
  render() {
    return html`
      <svg width="0" height="0" style="position:absolute" aria-hidden="true">
        <defs>
          <filter id=${this.filterId} filterUnits="objectBoundingBox"
                  x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
            <feImage x="0" y="0" width="100%" height="100%" result="map"></feImage>
            <feDisplacementMap in="SourceGraphic" in2="map" id="disp"
              xChannelSelector="R" yChannelSelector="G" scale="0" result="refr"/>
            <feImage x="0" y="0" width="100%" height="100%" id="specImage" result="specSrc"></feImage>
            <!-- FilterGraph will append/update nodes as needed -->
          </filter>
        </defs>
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'mini-glass-filter': MiniGlassFilter; }
}
