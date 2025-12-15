import type { LitElement } from 'lit';
import { clearDynamic, build } from '../core/filters/core.js';
import { chromaticFast } from '../core/filters/chromatic.js';
import { blur } from '../core/filters/blur.js';
import { noiseBlur } from '../core/filters/noiseBlur.js';
import { specular } from '../core/filters/specularFilter.js';

/**
 * Runtime builder for a composable SVG filter graph.
 */
export class FilterGraph {
  private host: LitElement;
  private filterEl?: SVGFilterElement;
  private dispEl?: SVGFEDisplacementMapElement;
  private stagesKey = '';

  constructor(host: LitElement) {
    this.host = host;
  }

  hydrateRefs() {
    const root = this.host.renderRoot as ShadowRoot;
    this.filterEl = root.querySelector('filter') as SVGFilterElement | undefined;
    this.dispEl = root.querySelector('feDisplacementMap') as SVGFEDisplacementMapElement | undefined;
    if (!this.filterEl) return;
  }

  buildIfNeeded(state: {
    dispersion: number;
    blurKind: 'gauss' | 'noise1' | 'noise2';
    showSpecular: boolean;
    blurStdDev: number;
    specularStrength: number;
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
    
    const stages: ((f: SVGFilterElement, input: string) => string)[] = [];
    
    // Use the new fast chromatic stage
    if (state.dispersion > 0) stages.push(chromaticFast);
    
    if (state.blurKind === 'gauss') stages.push(blur(state.blurStdDev));
    else if (state.blurKind === 'noise1') stages.push(noiseBlur('low', state.blurStdDev));
    else stages.push(noiseBlur('high', state.blurStdDev));
    
    if (state.showSpecular) stages.push(specular(state.specularStrength));
    
    build(this.filterEl, 'refr', stages);
  }

  updateParams(state: {
    blurStdDev: number;
    blurKind: 'gauss' | 'noise1' | 'noise2';
    specularStrength: number;
    scale_px: number;
    dispersion?: number;
  }) {
    const root = this.host.renderRoot as ShadowRoot;
    
    // 1. Update Blur
    if (state.blurKind === 'gauss') {
      const g = root.querySelector('[data-role=\"blur\"]') as SVGElement | null;
      if (g && g.getAttribute('stdDeviation') !== String(state.blurStdDev)) {
        g.setAttribute('stdDeviation', state.blurStdDev.toFixed(2));
      }
    } else {
      const n = root.querySelector('[data-role=\"noiseScale\"]') as SVGElement | null;
      if (n) {
        const factor = state.blurKind === 'noise1' ? 20 : 40;
        const scale = (state.blurStdDev * factor).toFixed(2);
        if (n.getAttribute('scale') !== scale) {
          n.setAttribute('scale', scale);
        }
      }
    }

    // 2. Update Specular
    const gain = root.querySelector('[data-role=\"specGain\"]') as SVGElement | null;
    if (gain && gain.getAttribute('slope') !== String(state.specularStrength)) {
      gain.setAttribute('slope', String(state.specularStrength));
    }

    // 3. Update Main Refraction Scale
    if (this.dispEl && this.dispEl.getAttribute('scale') !== String(state.scale_px)) {
      this.dispEl.setAttribute('scale', String(state.scale_px));
    }

    // 4. Update Chromatic Dispersion (Fast Offset Method)
    const dispersion = state.dispersion ?? 0;
    // Multiplier to make the UI slider feel responsive
    const offsetPx = dispersion * 2.0;

    const offR = root.querySelector('[data-role=\"offR\"]') as SVGFEOffsetElement | null;
    const offB = root.querySelector('[data-role=\"offB\"]') as SVGFEOffsetElement | null;

    if (offR && offB) {
      // Apply lateral shifts: Red moves right, Blue moves left
      offR.setAttribute('dx', String(offsetPx.toFixed(2)));
      offB.setAttribute('dx', String((-offsetPx).toFixed(2)));
    }
  }
}