import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js'; 
import './filter-lite.ts';

@customElement('press-glass')
export class PressGlass extends LitElement {
    static override shadowRootOptions: ShadowRootInit = {
        ...LitElement.shadowRootOptions,
        mode: 'open' as const, 
    };
    @property({type: Boolean, reflect: true}) active = false;
     @property({type: Boolean, reflect: true}) always = false;
    /** customize or leave blank for auto id */
    @property({type: String, attribute: 'filter-id'}) filterId = '';
    /** mirror all filter-lite inputs so creators can pass them */
    @property({type: Number}) width = 300;
    @property({type: Number}) height = 120;
    @property({type: Number}) radius = 16;
    @property({type: Number}) bezelWidth = 24;
    @property({type: Number}) glassThickness = 40;
    @property({type: String}) surface: 'convex_squircle'|'flat'|'concave' = 'convex_squircle';
    @property({type: Number}) refractiveIndex = 1.5;
    @property({type: Number}) scale_px = 160;
    @property({type: Number}) dispersion = 0;
    @property({type: Boolean}) showSpecular = true;
    @property({type: Number}) specularAngleDeg = 60;
    @property({type: Number}) specularStrength = 0.9;
    @property({type: String}) blurKind: 'gauss'|'noise1'|'noise2' = 'gauss';
    @property({type: Number}) blurStdDev = 0.2;

   private _autoId = `pg-${Math.random().toString(36).slice(2)}`;
   private get _fid() { return this.filterId || this._autoId; }

  static styles = css`
    :host {
      display: block;
      border-radius: 16px;
      isolation: isolate;
      --frost: 0;          /* tweak if you want a veil */
      --saturation: 1;
    }
    .wrap {
      position: relative;
      border-radius: inherit;
    }
    .effect {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0;
      z-index: 1; 
      transition: opacity 140ms ease;
      background: light-dark(
        hsl(0 0% 100% / var(--frost, 0)),
        hsl(0 0% 0% / var(--frost, 0))
      );
      backdrop-filter: var(--pg-url) saturate(var(--saturation, 1));
      -webkit-backdrop-filter: var(--pg-url) saturate(var(--saturation, 1));
    }
    :host([active]) .effect { opacity: 1; } 
    :host([always]) .effect { opacity: 1; }

    /* Idle = white; Active = let glass show through */
    :host(:not([active])) ::slotted(*) { /* conservative defaults */
      --idle-button-bg: rgba(255,255,255,.08);
      --idle-button-fg: #fff;
      --idle-border: rgba(255,255,255,.18);
    }
  `;

  private _onDown = () => {
    this.active = true;
    const up = () => { this.active = false; window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
    private _onFocusIn = () => { this.active = true; };
    private _onFocusOut = () => { this.active = false; };
    private _ro?: ResizeObserver;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerdown', this._onDown);
    this.addEventListener('focusin', this._onFocusIn);
    this.addEventListener('focusout', this._onFocusOut);
    this._ro = new ResizeObserver(([e]) => {
        const cr = e?.contentRect;
        if (!cr) return;
        const w = Math.max(1, Math.round(cr.width));
        const h = Math.max(1, Math.round(cr.height));
        if (w !== this.width) this.width = w;
        if (h !== this.height) this.height = h;
        });
    this._ro.observe(this);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('pointerdown', this._onDown);
    this.removeEventListener('focusin', this._onFocusIn);
    this.removeEventListener('focusout', this._onFocusOut);
    this._ro?.disconnect();
  }

  render() {
    return html`
       <style>:host{ --pg-url: url(#${this._fid}); }</style>
       <glass-filter-lite
         filter-id=${this._fid}
         .width=${this.width} .height=${this.height} .radius=${this.radius}
         .bezelWidth=${this.bezelWidth} .glassThickness=${this.glassThickness}
         .surface=${this.surface}
         .refractiveIndex=${this.refractiveIndex} .scale_px=${this.scale_px}
         .dispersion=${this.dispersion} .showSpecular=${this.showSpecular}
         .specularAngleDeg=${this.specularAngleDeg} .specularStrength=${this.specularStrength}
         .blurKind=${this.blurKind} .blurStdDev=${this.blurStdDev}>
       </glass-filter-lite>
      <div class="wrap">
        <div class="effect"></div>
        <slot></slot>
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'press-glass': PressGlass; } }
