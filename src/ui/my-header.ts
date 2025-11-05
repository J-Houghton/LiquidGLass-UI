import {LitElement, html, css} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('my-header')
export class MyHeader extends LitElement {
    static styles = css`
      header {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          padding: 20px 0;
          width: var(--content-width);
          max-width: calc(100vw - 2rem);
          max-width: calc(min(100vw - 2rem, var(--content-width)));
          margin: 0 auto;
      }
      
      .title {
          margin: 0;
          font-weight: 700;
          letter-spacing: 0.2px;
          font-size: clamp(22px, 3vw, 28px);
      } 
      
      .btn {
          padding: 0.55rem 0.9rem;
          border-radius: 999px;
          border: 1px solid var(--button-border);
          background: var(--button-bg);
          color: var(--button-fg);
          cursor: pointer;
          text-decoration: none;
          transition: border-color 0.2s ease, background-color 0.2s ease;
      }

      .btn:hover {
          border-color: color-mix(in oklch, var(--button-fg), transparent 35%);
          background: var(--button-hover-bg);
      }

      .btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
      }
  `
  render() {
    return html` 
      <header>
          <h1 class="title">Liquid Glass</h1>
            <div class="actions">
              <a class="btn" href="#readable">Readable text</a>
              <a class="btn" href="#showcase">Presets</a>
            </div>
      </header>
    `;
  }
}
