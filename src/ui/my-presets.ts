import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import '../lib/glass/press-glass.ts'; 
import '../lib/glass/glass-slider.ts';

@customElement("my-presets")
export class MyPresets extends LitElement {
    static override shadowRootOptions: ShadowRootInit = {
        ...LitElement.shadowRootOptions,
        mode: 'open' as const, 
    };
  static styles = css`
    :host {
      display: block;
      margin: 20px auto;
      width: var(--content-width);
      max-width: calc(min(100vw - 2rem, var(--content-width))); 
    }
    :host([preset]) {
        position: relative;
        width: 100%;
        height: 100%;
        cursor: auto;
    }
    /* hide overlay until activated */
    :host([preset]) .effect { opacity: 0; transition: opacity 140ms ease; }
    :host([preset][active]) .effect { opacity: 1; }
    .card {
      display: grid;
      gap: 16px;
      grid-template-columns: 1fr;
      padding: var(--p);
      border: 1px solid var(--card-border);
      border-radius: var(--r-12);
      background: var(--card-bg);
      color: var(--card-fg);
      backdrop-filter: blur(6px) saturate(120%);
      background: repeating-linear-gradient(45deg, #eee 0 1px, #111 1px 10px);
    }

    .row {
      display: grid;
      gap: 12px;
      grid-template-columns: 180px 1fr;
      align-items: center;
    }

    .label {
      font: inherit;
      color: var(--card-fg);
      opacity: 0.9;
    }

    /* Button */
    .btn {
      appearance: none;
      border: 1px solid var(--button-border);
      background: var(--button-bg);
      color: var(--button-fg);
      padding: 10px 14px;
      border-radius: 12px;
      cursor: pointer;
      font: inherit;
    }
    .btn:active { transform: translateY(1px); }

    /* Slider */
    input[type="range"] {
      width: 100%;
      accent-color: var(--accent-fg);
    } 

    .value {
      font-variant-numeric: tabular-nums;
      opacity: 0.8;
    }
    .litEffect  {
        display: block;
        border-radius: 16px;
        padding: 16px;
        isolation: isolate; 

    
        z-index: 1999;
        /* frost overlay uses alpha from --frost */
        background: light-dark(
            hsl(0 0% 100% / var(--frost, 0.2)),
            hsl(0 0% 0% / var(--frost, 0.2))
        );
        /* saturation applied to backdrop */
        backdrop-filter: url(#test_filter) saturate(var(--saturation, 1));
        -webkit-backdrop-filter: url(#filter) saturate(var(--saturation, 1)); /* Safari */

        will-change: backdrop-filter, transform; 
        backface-visibility: hidden;             
        contain: paint;                          
        transform: translateZ(0);
    } 
  `;

   @state() private sliderVal = 50; 
   @state() private clicks = 0; 

  private onSlide(e: Event) {
    const t = e.currentTarget as HTMLInputElement;
    this.sliderVal = Number(t.value);
  }
 
  private onClick() {
    this.clicks += 1;
  }
 

  render() {
return html`
    <section class="card">
      <div class="row">
          <div class="label">Slider</div>
        <glass-filter-lite filter-id="test_filter" >
       </glass-filter-lite> 
            <span class="value">${this.sliderVal}</span>
      </div> 

      <div class="row">
        <div class="label">Button</div> 
          <button class="btn" @click=${this.onClick}>Confirm</button>
          <span class="value" style="margin-left:12px">clicks: ${this.clicks}</span> 
      </div>
    </section>
  `;
  }
}
