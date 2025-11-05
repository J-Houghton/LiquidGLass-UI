import {LitElement, html, css} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('my-texts')
export class MyTexts extends LitElement {
    static styles = css` 
        .my-text-container { 
            padding: var(--p);
            border: 1px solid var(--card-border);
            border-radius: var(--r-12);
            background: var(--card-bg);
            color: var(--card-fg);
        }
        .text h3 {
            margin: 6px 0 8px
        }
        .band {
            height: 110px;
            border-radius: 12px;
            background: linear-gradient(90deg, #111 0, #eee 100%);
            margin-top: 12px
        }

        .diag {
            height: 110px;
            border-radius: 12px;
            margin-top: 12px;
            background: repeating-linear-gradient(45deg, #eee 0 1px, #111 1px 10px)
        }   
    `;

    render() {
        return html`
            <div class="my-text-container">
                <h3>Readable, mixed-weight text</h3>
                <p>
                    Real-time refraction and frost. Configurable surfaces. Drag anywhere.
                    <a href="#">Sample link</a> and <strong>bold text</strong> to test contrast. Use this row to pass beneath your
                    glass and verify displacement along edges and glyph stems.
                </p>
                <div class="band" aria-hidden="true"></div>
                <div class="diag" aria-hidden="true"></div>
    </div>
        `
    }
} 