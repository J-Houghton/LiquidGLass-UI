import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('my-footer')
export class MyFooter extends LitElement {
  render() {
    return html`
      <footer>footer</footer>
    `;
  }
}
