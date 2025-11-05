import type { LitElement } from 'lit';
import { clearDynamic, build } from '../filters/core.js';
import { chromatic } from '../filters/chromatic.js';
import { blur } from '../filters/blur.js';
import { noiseBlur } from '../filters/noiseBlur.js';
import { specular } from '../filters/specularFilter.js';

export class FilterGraph {
  private host: LitElement;
  private filterEl?: SVGFilterElement;
  private dispEl?: SVGFEDisplacementMapElement;
  private stagesKey = '';

  constructor(host: LitElement) { this.host = host; }

  hydrateRefs() {
    // safe after first render
    const root = this.host.renderRoot as ShadowRoot;
    this.filterEl = root.querySelector('#filter') as SVGFilterElement | null || undefined;
    this.dispEl = root.querySelector('#disp') as SVGFEDisplacementMapElement | null || undefined;

    if (this.filterEl?.getAttribute('filterUnits') !== 'userSpaceOnUse') {
      this.filterEl?.setAttribute('filterUnits', 'userSpaceOnUse');  
      this.filterEl?.setAttribute('x', '0');                         
      this.filterEl?.setAttribute('y', '0');                         
      this.filterEl?.setAttribute('width', '100%');                  
      this.filterEl?.setAttribute('height', '100%');                 
    }

  }

  updateFilterRes(w: number, h: number) {                          
    if (!this.filterEl) return;
    // clamp to a sane max; tune as needed
    const W = Math.min(1024, Math.max(128, Math.round(w)));       
    const H = Math.min(1024, Math.max(128, Math.round(h)));       
    const cur = this.filterEl.getAttribute('filterRes');          
    const next = `${W} ${H}`;                                     
    if (cur !== next) this.filterEl.setAttribute('filterRes', next);
  }

  buildIfNeeded(state: {
    dispersion: number; blurKind: 'gauss'|'noise1'|'noise2'; showSpecular: boolean; blurStdDev: number; specularStrength: number;
  }) {
    if (!this.filterEl) return;
    const key = JSON.stringify({
      dispersion: state.dispersion > 0,
      blurKind: state.blurKind,
      showSpecular: state.showSpecular,
    });
    if (key === this.stagesKey) return;
    this.stagesKey = key;

    clearDynamic(this.filterEl);
    const stages: any[] = [];
    if (state.dispersion > 0) stages.push(chromatic);
    if (state.blurKind === 'gauss') stages.push(blur(state.blurStdDev));
    else if (state.blurKind === 'noise1') stages.push(noiseBlur('low', state.blurStdDev));
    else stages.push(noiseBlur('high', state.blurStdDev));
    if (state.showSpecular) stages.push(specular(state.specularStrength)); // strength adjust in update
    build(this.filterEl, 'refr', stages);
  }

  updateParams(state: { blurStdDev: number; blurKind: 'gauss'|'noise1'|'noise2'; specularStrength: number; scale_px: number; 
  dispersion?: number;  }) {
  const root = this.host.renderRoot as ShadowRoot;

  if (state.blurKind === 'gauss') {
    const g = root.querySelector('#kBlur') as SVGElement | null;
    if (g && g.getAttribute('stdDeviation') !== String(state.blurStdDev)) {
      g.setAttribute('stdDeviation', String(state.blurStdDev));
    }
  } else {
    const n = root.querySelector('#kNoiseScale') as SVGElement | null;   // <-- CHANGED SELECTOR
    // map σ to displacement scale; tune factors per noise profile
    const factor = state.blurKind === 'noise1' ? 20 : 40;               
    const scale = (state.blurStdDev * factor).toFixed(2);
    if (n && n.getAttribute('scale') !== scale) {
      n.setAttribute('scale', scale);                                    // <-- UPDATE THE DISPLACEMENT MAP
    }
  }

  const gain = root.querySelector('#specGain') as SVGElement | null;
  if (gain && gain.getAttribute('slope') !== String(state.specularStrength)) {
    gain.setAttribute('slope', String(state.specularStrength));
  }

  if (this.dispEl && this.dispEl.getAttribute('scale') !== String(state.scale_px)) {
    this.dispEl.setAttribute('scale', String(state.scale_px));
  }
 const d = (state.dispersion ?? 0);
  const offR = root.querySelector('#offR') as SVGElement | null;
  const offG = root.querySelector('#offG') as SVGElement | null;
  const offB = root.querySelector('#offB') as SVGElement | null;

  if (offR && offG && offB) {
    // scale the aberration with displacement scale; tune factor to taste
    const px = Math.max(0, state.scale_px);
    const mag = +(d * px * 0.01).toFixed(3);   // 1% of disp scale per 1.0 dispersion  <-- ADDED

    // shift along X; you can add Y if desired
    if (offR.getAttribute('dx') !== String(+mag))   offR.setAttribute('dx', String(+mag));  
    if (offR.getAttribute('dy') !== '0')            offR.setAttribute('dy', '0');           

    if (offG.getAttribute('dx') !== '0')            offG.setAttribute('dx', '0');           
    if (offG.getAttribute('dy') !== '0')            offG.setAttribute('dy', '0');           

    if (offB.getAttribute('dx') !== String(-mag))   offB.setAttribute('dx', String(-mag));  
    if (offB.getAttribute('dy') !== '0')            offB.setAttribute('dy', '0');           
  }
}
}
