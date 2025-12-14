import type { LitElement } from 'lit';
import { clearDynamic, build } from '../core/filters/core.js';
import { chromatic } from '../core/filters/chromatic.js';
import { blur } from '../core/filters/blur.js';
import { noiseBlur } from '../core/filters/noiseBlur.js';
import { specular } from '../core/filters/specularFilter.js';

/**
 * Runtime builder for a composable SVG filter graph.  Given a host element,
 * this helper locates the embedded `<filter>` definition and lazily creates
 * additional filter primitives according to the current settings.  It also
 * allows dynamic updates to blur, noise and specular parameters without
 * rebuilding the entire graph.
 */
export class FilterGraph {
  private host: LitElement;
  private filterEl?: SVGFilterElement;
  private dispEl?: SVGFEDisplacementMapElement;
  private stagesKey = '';

  constructor(host: LitElement) {
    this.host = host;
  }

  /**
   * Capture references to the filter and displacement map elements after the
   * host has rendered.  This method should be called from the host's
   * `firstUpdated()` lifecycle to ensure the shadow root has been created.
   */
  hydrateRefs() {
    const root = this.host.renderRoot as ShadowRoot;
    // Select the first <filter> in the shadow root rather than relying on a
    // hardcoded id.  This allows the host to name the filter arbitrarily.
    this.filterEl = root.querySelector('filter') as SVGFilterElement | undefined;
    this.dispEl = root.querySelector('feDisplacementMap') as SVGFEDisplacementMapElement | undefined;
    if (!this.filterEl) return; 
  }
 

  /**
   * Build the filter graph if the set of enabled effects has changed.  The
   * `state` object describes whether chromatic dispersion, blur and specular
   * stages should be inserted.  Stages are only rebuilt when the high‑level
   * combination of settings changes; parameter tweaks are handled by
   * `updateParams()`.
   */
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
    if (state.dispersion > 0) stages.push(chromatic);
    if (state.blurKind === 'gauss') stages.push(blur(state.blurStdDev));
    else if (state.blurKind === 'noise1') stages.push(noiseBlur('low', state.blurStdDev));
    else stages.push(noiseBlur('high', state.blurStdDev));
    if (state.showSpecular) stages.push(specular(state.specularStrength));
    build(this.filterEl, 'refr', stages);
  }

  /**
   * Update parameters on filter primitives created by the graph.  This allows
   * adjusting blur radius, noise scale, specular strength and dispersion
   * offsets without destroying and rebuilding the entire graph.
   */
  updateParams(state: {
    blurStdDev: number;
    blurKind: 'gauss' | 'noise1' | 'noise2';
    specularStrength: number;
    scale_px: number;
    dispersion?: number; 
  }) {
    const root = this.host.renderRoot as ShadowRoot;
    if (state.blurKind === 'gauss') {
      const g = root.querySelector('[data-role="blur"]') as SVGElement | null;
      if (g && g.getAttribute('stdDeviation') !== String(state.blurStdDev)) {
        g.setAttribute('stdDeviation', state.blurStdDev.toFixed(2));
      }
    } else {
      const n = root.querySelector('[data-role="noiseScale"]') as SVGElement | null;
      if (n) {
        const factor = state.blurKind === 'noise1' ? 20 : 40;
        const scale = (state.blurStdDev * factor).toFixed(2);
        if (n.getAttribute('scale') !== scale) {
          n.setAttribute('scale', scale);
        }
      }
    }
    // Update the specular gain by querying the component transfer function via its role attribute.
    const gain = root.querySelector('[data-role="specGain"]') as SVGElement | null;
    if (gain && gain.getAttribute('slope') !== String(state.specularStrength)) {
      gain.setAttribute('slope', String(state.specularStrength));
    }
    if (this.dispEl && this.dispEl.getAttribute('scale') !== String(state.scale_px)) {
      this.dispEl.setAttribute('scale', String(state.scale_px));
    }
    // Update dispersion displacement.  Compute a base magnitude proportional
    // to the dispersion amount and the displacement scale.  Fixed multipliers
    // (+1, 0, -1) keep the channels separated while allowing dispersion to
    // control overall strength.  Values are clamped to ±8 to avoid extreme warping.
    const dispersion = state.dispersion ?? 0;
    const px = Math.max(0, state.scale_px);
    
    const clamp = (v: number) => Math.max(-8, Math.min(8, v));
    const base = clamp(dispersion * px * 0.01);
    const dispR = root.querySelector('feDisplacementMap[data-role="dispR"]') as SVGFEDisplacementMapElement | null;
    const dispG = root.querySelector('feDisplacementMap[data-role="dispG"]') as SVGFEDisplacementMapElement | null;
    const dispB = root.querySelector('feDisplacementMap[data-role="dispB"]') as SVGFEDisplacementMapElement | null;
    if (dispR) {
      dispR.setAttribute('scale', String(clamp(base * 1)));
    }
    if (dispG) {
      dispG.setAttribute('scale', String(clamp(base * 0)));
    }
    if (dispB) {
      dispB.setAttribute('scale', String(clamp(base * -1)));
    }
  }
}