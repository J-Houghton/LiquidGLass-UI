import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import { buildPane } from './pane';
import {uiStateCtx, UIStateStore} from '../lib/state/ui-state';
import type { UIState } from '../lib/state/ui-state';
import {ContextProvider} from '@lit/context';
import './components/debug-panel.ts';

import './my-header.ts';
import './components/glass-hero.ts';
import './my-texts.ts';
import './my-presets.ts';
import './my-footer.ts';
import '../lib/glass/index.ts';
import '../index.css';

@customElement('my-page')
export class MyPage extends LitElement {

  private store = new UIStateStore({
    width: 300, height: 220, radius: 60,
    refractiveIndex: 1.5, glassThickness: 50,
    bezelWidth: 60, scale_px: 180, dispersion: 0,
    surface: 'convex_squircle', frost: 0.05, saturation: 1, debug: false,
    blurStdDev: 0.2, blurKind: 'gauss',
    showSpecular: true, specularAngleDeg: 60, specularStrength: 0.9,
    r: 1.0, g: 0.25, b: -1.0,
  });

  private readonly _ctxProvider: ContextProvider<typeof uiStateCtx, this>;
  private paneState!: UIState;

  constructor() {
    super();
    this._ctxProvider = new ContextProvider(this, {                    // <-- MOVED EARLY
      context: uiStateCtx,
      initialValue: this.store,
    });
    this._ctxProvider.setValue(this.store);
    this.paneState = {...this.store.value};                            // <-- INIT ONCE
    buildPane(this.paneState, () => this.store.update({...this.paneState}));
  } 

  
  render() {
    return html` 
      <my-header></my-header>
      <glass-hero></glass-hero>
      <glass-container></glass-container>
      <debug-panel></debug-panel> 
      <my-texts></my-texts> 
      <my-presets></my-presets> 
      <my-footer></my-footer> 

      <div id="pane-root" style="position:fixed; top:8px; right:8px; z-index:1000;"></div> 
    `;
  }
}
