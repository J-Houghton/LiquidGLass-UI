import {LitElement, html, css} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';
import {FilterGraph} from './controllers/filter-graph.js';
import {rebuildDisplacementIfNeeded, rebuildSpecularIfNeeded} from './services/images.js';
import {asSurfaceKind} from './optics/surfaces.js';
import {validate, type Validated} from './validation/geometry.js';
import {classMap} from 'lit/directives/class-map.js';

@customElement('glass-filter-lite')
export class GlassFilterLite extends LitElement {
    static override shadowRootOptions: ShadowRootInit = {
        ...LitElement.shadowRootOptions,
        mode: 'open' as const, 
    };

    static stles = css` 
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
        .test_filter {
            width: 100%;
            height: 100%;
            pointer-events: none;
            position: absolute;
            inset: 0;
        }
        .gfLite {  
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
            backdrop-filter: url(#test_filter) saturate(var(--saturation, 1));
            -webkit-backdrop-filter: url(#filter) saturate(var(--saturation, 1)); /* Safari */

            will-change: backdrop-filter, transform; 
            backface-visibility: hidden;             
            contain: paint;                          
            transform: translateZ(0);
        }
    `
  // unique id per instance to avoid collisions
  @property({type: String, attribute: 'filter-id'}) filterId = 'gf-lite'; 
  @property() classes = { litEffect: true, gfLite: true };  

  // fixed config (no global store subscription)
  @property({type: Number}) width = 734;
  @property({type: Number}) height = 37;
  @property({type: Number}) radius = 18;
  @property({type: Number}) bezelWidth = 18;
  @property({type: Number}) glassThickness = 50;
  @property({type: String}) surface: string = 'convex_squircle';
  @property({type: Number}) refractiveIndex = 1.8;
  @property({type: Number}) scale_px = 200;
  @property({type: Number}) dispersion = 3;
  @property({type: Boolean}) showSpecular = true;
  @property({type: Number}) specularAngleDeg = 60;
  @property({type: Number}) specularStrength = 0.9;
  @property({type: String}) blurKind: 'gauss' | 'noise1' | 'noise2' = 'gauss';
  @property({type: Number}) blurStdDev = 0.2;

  @query('feImage[result="map"]') private feMap!: SVGFEImageElement;
  @query('#disp') private dispEl!: SVGFEDisplacementMapElement;
  @query('#specImage') private specImgEl!: SVGImageElement;

  private graph = new FilterGraph(this);

  private v(): Validated {
    return validate({
      width: this.width, height: this.height, radius: this.radius,
      bezelWidth: this.bezelWidth, glassThickness: this.glassThickness,
      surface: asSurfaceKind(this.surface),
    });
  }

  protected override async updated() {
    const v = this.v();

    await rebuildDisplacementIfNeeded(
      v,
      {refractiveIndex: this.refractiveIndex, surface: asSurfaceKind(this.surface)},
      this.feMap
    );
    if (this.dispEl) {
      this.dispEl.setAttribute('xChannelSelector', 'R');
      this.dispEl.setAttribute('yChannelSelector', 'G');
      this.dispEl.setAttribute('scale', String(this.scale_px));
    }

    await rebuildSpecularIfNeeded(
      v,
      {specularAngleDeg: this.specularAngleDeg, specularStrength: this.specularStrength, showSpecular: this.showSpecular},
      this.specImgEl
    );

    this.graph.buildIfNeeded({dispersion: this.dispersion, blurKind: this.blurKind, showSpecular: this.showSpecular, blurStdDev: this.blurStdDev, specularStrength: this.specularStrength});
    this.graph.updateParams({blurStdDev: this.blurStdDev, blurKind: this.blurKind, specularStrength: this.specularStrength, scale_px: this.scale_px, dispersion: this.dispersion});
    this.graph.updateFilterRes(v.width, v.height);
  }

  render() {
    return html`
    <div class=${classMap(this.classes)} >
      <svg class="test_filter"  xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id=${this.filterId} filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
            <feImage x="0" y="0" width="100%" height="100%" result="map"></feImage>
            <feDisplacementMap in="SourceGraphic" in2="map" id="disp" xChannelSelector="R" yChannelSelector="G" scale="0" result="refr" />
            <feImage x="0" y="0" width="100%" height="100%" id="specImage" result="specSrc"></feImage>
            <!-- FilterGraph appends the rest -->
          </filter>
        </defs>
      </svg>
    </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'glass-filter-lite': GlassFilterLite; } }
