import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('workbench-patterns')
export class WorkbenchPatterns extends LitElement {
  static styles = css`
    :host {
      display: grid;
      gap: 2rem;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: var(--demo-color-text);
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      opacity: 0.9;
      font-family: var(--font-display);
    }

    p {
      margin: 0;
      font-size: 1rem;
      line-height: 1.6;
      opacity: 0.8;
      max-width: 65ch;
    }

    .test-block {
      width: 100%;
      height: 120px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    /* Test 1: Smooth Gradient */
    .gradient-ramp {
      background: linear-gradient(to right, #000, #333, #666, #999, #ccc, #fff);
    }

    /* Test 2: High Contrast Lines */
    .diagonal-stripes {
      background-color: #050505;
      background-image: repeating-linear-gradient(
        45deg,
        #050505 0px,
        #050505 10px,
        #ffffff 10px,
        #ffffff 12px
      );
    }
    
    :host-context([data-theme='light']) .diagonal-stripes {
       background-color: #fff;
       background-image: repeating-linear-gradient(
        45deg,
        #fff 0px,
        #fff 10px,
        #000 10px,
        #000 12px
      );
    }
  `;

  render() {
    return html`
      <div class="section">
        <h3>Readable, mixed-weight text</h3>
        <p>
          Real-time refraction and frost. Configurable surfaces. Drag anywhere.
          <a href="#" onclick="return false;">Sample link</a> and <strong>bold text</strong> to test contrast.
          Use this row to pass beneath your glass and verify displacement along edges and glyph stems.
        </p>
      </div>

      <div class="section">
        <h3>Luma Ramp (Banding Check)</h3>
        <div class="test-block gradient-ramp"></div>
      </div>

      <div class="section">
        <h3>High Frequency Edges (Aliasing Check)</h3>
        <div class="test-block diagonal-stripes"></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'workbench-patterns': WorkbenchPatterns;
  }
}