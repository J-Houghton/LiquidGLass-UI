import type { LitElement } from 'lit';
import { clearDynamic, build } from './filters/core.js';
import { chromatic } from './filters/chromatic.js';
import { blur } from './filters/blur.js';
import { noiseBlur } from './filters/noiseBlur.js';
import { specular } from './filters/specularFilter.js';

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
    dispersion?: number; disp_r?: number; disp_g?: number; disp_b?: number;
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
    // Update dispersion offsets.  Compute a base magnitude proportional to
    // the dispersion amount and the displacement scale.  When per-channel
    // multipliers are provided they scale the base; otherwise sensible
    // defaults (+1, 0, -1) are used.  The values are clamped to ±8 px.
    const dispersion = state.dispersion ?? 0;
    const px = Math.max(0, state.scale_px);
    const base = dispersion * px * 0.01;
    const clamp = (v: number) => Math.max(-8, Math.min(8, v));
    const dxR = clamp((state.disp_r ?? 1) * base);
    const dxG = clamp((state.disp_g ?? 0) * base);
    const dxB = clamp((state.disp_b ?? -1) * base);
    // Locate the per-channel offset elements using data-role markers and
    // update their dx/dy values.  These are local to the filter so they
    // will not collide with other instances.
    const offR = root.querySelector('feOffset[data-role="offR"]') as SVGFEOffsetElement | null;
    const offG = root.querySelector('feOffset[data-role="offG"]') as SVGFEOffsetElement | null;
    const offB = root.querySelector('feOffset[data-role="offB"]') as SVGFEOffsetElement | null;
    if (offR) {
      offR.setAttribute('dx', String(dxR));
      offR.setAttribute('dy', '0');
    }
    if (offG) {
      offG.setAttribute('dx', String(dxG));
      offG.setAttribute('dy', '0');
    }
    if (offB) {
      offB.setAttribute('dx', String(dxB));
      offB.setAttribute('dy', '0');
    }
  }
}