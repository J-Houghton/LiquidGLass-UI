import { SURFACE_FNS, type SurfaceKind } from '../core/optics/surfaces.js';
import { calculateDisplacementMap } from '../core/optics/disp1d.js';
import { calculateDisplacementMap2 } from '../core/optics/disp2d.js';
import { buildSpecularImage } from '../core/optics/specularLight.js';
import type { Validated } from '../core/validation/geometry.js';
import { cache, imageDataToBlobURL } from './filterCache.js';

/**
 * Legacy glue for the Lit components: regenerate maps when parameters change and point the
 * filter's <feImage> elements at them. Replaced by createGlassFilter in Phase 3.
 */

const currentDpr = (): number => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

/**
 * Conditionally rebuild the displacement map. If parameters match the cache, generation is
 * skipped but the provided element is always pointed at the cached URL.
 */
export async function rebuildDisplacementIfNeeded(
  v: Validated,
  state: { refractiveIndex: number; surface: SurfaceKind; chromaticBezelFactor: number },
  feMap: SVGFEImageElement | undefined,
) {
  const surf = SURFACE_FNS[state.surface].fn;
  const dpr = currentDpr();
  const dispKey = JSON.stringify({
    w: v.width,
    h: v.height,
    r: v.radius,
    b: v.bezelWidth,
    n: state.refractiveIndex,
    t: v.glassThickness_eff,
    surface: state.surface,
    cbf: state.chromaticBezelFactor,
    dpr,
  });

  if (cache.dispKey !== dispKey) {
    const disp1D = calculateDisplacementMap(v.glassThickness_eff, v.bezelWidth, surf, state.refractiveIndex, 512);
    const maxAbs = disp1D.reduce((m: number, val: number) => Math.max(m, Math.abs(val)), 1);
    const img = calculateDisplacementMap2(
      v.width,
      v.height,
      v.radius,
      v.bezelWidth,
      maxAbs,
      disp1D,
      dpr,
      state.chromaticBezelFactor,
    );
    if (cache.dispUrl) URL.revokeObjectURL(cache.dispUrl);
    cache.dispUrl = await imageDataToBlobURL(img);
    cache.dispKey = dispKey;
  }

  if (feMap && cache.dispUrl) {
    feMap.setAttribute('href', cache.dispUrl);
  }
}

/**
 * Conditionally rebuild the specular highlight image.
 */
export async function rebuildSpecularIfNeeded(
  v: Validated,
  state: { specularAngleDeg: number; specularStrength: number; showSpecular: boolean },
  specImgEl: SVGImageElement | undefined,
) {
  const dpr = currentDpr();
  const specKey = JSON.stringify({
    w: v.width,
    h: v.height,
    r: v.radius,
    b: v.bezelWidth,
    a: state.specularAngleDeg,
    s: state.specularStrength,
    on: state.showSpecular,
    dpr,
  });

  if (cache.specKey !== specKey) {
    if (cache.specUrl) {
      URL.revokeObjectURL(cache.specUrl);
      cache.specUrl = null;
    }
    if (state.showSpecular) {
      const specImg = buildSpecularImage(
        v.width,
        v.height,
        v.radius,
        v.bezelWidth,
        state.specularAngleDeg,
        state.specularStrength,
        dpr,
      );
      cache.specUrl = await imageDataToBlobURL(specImg);
    }
    cache.specKey = specKey;
  }

  if (specImgEl) {
    const url = cache.specUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    specImgEl.setAttribute('href', url);
  }
}
