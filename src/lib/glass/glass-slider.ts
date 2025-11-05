import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import './press-glass.ts';

@customElement('glass-slider')
export class GlassSlider extends LitElement {
    static override shadowRootOptions: ShadowRootInit = {
        ...LitElement.shadowRootOptions,
        mode: 'open' as const, 
    };

  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) value = 50;
  @property({ type: Number }) step = 1;

  // pass-through optics for the thumb
  @property({ type: String, attribute: 'filter-id' }) filterId = 'gs-thumb';
  @property({ type: Number }) thumbSize = 36;
  @property({ type: Number }) radius = 18;
  @property({ type: Number }) refractiveIndex = 1.6;
  @property({ type: Number }) scale_px = 200;
@query('.track') private track!: HTMLDivElement;

  @state() private dragging = false;

  static styles = css`
    :host { display:block; position:relative; height:38px; }
    .track {
      position:absolute; left:0; right:0; top:50%;
      height:4px; transform:translateY(-50%);
      border-radius:4px;
      background: color-mix(in oklch, var(--button-bg, #121212), #ffffff 15%);
    }
    press-glass { --frost: 0.06; }
    .fill {
      height:100%; border-radius:inherit;
      background: var(--accent, #0377F7);
      width: var(--fill, 0%);
    }
    press-glass.thumb {
      position:absolute; top:50%;
      transform: translate(-50%, -50%);
      width: var(--ts); height: var(--ts);
      border-radius: 50%;
      pointer-events: none; /* glass overlay doesn't eat events */
    }
    .hit {
      position:absolute; inset:0;
      cursor: pointer;
      touch-action: pan-y;
    }
  `;

  private ratioFromValue(v: number) {
    const clamped = Math.min(this.max, Math.max(this.min, v));
    return (clamped - this.min) / (this.max - this.min || 1);
  }

  private valueFromClientX(x: number) {
    const rect = this.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    const v = this.min + r * (this.max - this.min);
    const stepped = Math.round(v / this.step) * this.step;
    return Math.min(this.max, Math.max(this.min, stepped));
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.onMove(e);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.value = this.valueFromClientX(e.clientX);
    this.dispatchEvent(new CustomEvent('input', { detail: this.value }));
  };

  private onUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    this.dispatchEvent(new CustomEvent('change', { detail: this.value }));
  };

  render() {
    const r = this.ratioFromValue(this.value);
    const leftPct = r * 100;
    const ts = `${this.thumbSize}px`;
    return html`
      <style>
        :host {
          --ts:${ts};
          --fill:${leftPct}%;
        }
      </style>
      <div class="track" aria-hidden="true"><div class="fill"></div></div>
      <press-glass
        class="thumb"
        always
        filter-id=${this.filterId}
        .width=${this.thumbSize}
        .height=${this.thumbSize}
        .radius=${this.radius}
        .refractiveIndex=${this.refractiveIndex}
        .scale_px=${this.scale_px}
        style="left:${leftPct}%;"
      ></press-glass>
      <div
        class="hit"
        role="slider"
        tabindex="0"
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
        @pointerdown=${this.onDown}
        @pointermove=${this.onMove}
        @pointerup=${this.onUp}
        @pointercancel=${this.onUp}
      ></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'glass-slider': GlassSlider; }
}
