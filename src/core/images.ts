// src/core/images.ts
import { SURFACE_FNS, type SurfaceKind } from './optics/surfaces.js';
import { calculateDisplacementMap } from './optics/disp1d.js';
import { calculateDisplacementMap2 } from './optics/disp2d.js';
import { buildSpecularImage } from './optics/specularLight.js';
import { cache, imageDataToBlobURL } from './fx/filterCache.js';

/**
 * Conditionally rebuild the displacement map used by the glass filter.  If the
 * current parameters match the last computed key, the cached result is reused.
 * Otherwise a new 1D displacement curve and its 2D map are generated and
 * converted into a blob URL for consumption by the SVG filter.
 *
 * @param v     Validated geometry describing the shape and materials
 * @param state Additional state including refractive index and surface type
 * @param feMap The `<feImage>` element whose href should be updated
 */
export async function rebuildDisplacementIfNeeded(
  v: any,
  state: { refractiveIndex: number; surface: SurfaceKind },
  feMap: SVGFEImageElement | undefined
) {
  const surf = SURFACE_FNS[state.surface].fn;
  const dispKey = JSON.stringify({
    w: v.width,
    h: v.height,
    r: v.radius,
    b: v.bezelWidth,
    n: state.refractiveIndex,
    t: v.glassThickness_eff,
    surface: state.surface,
  });
  if (cache.dispKey === dispKey) return;
  
  const disp1D = calculateDisplacementMap(
    v.glassThickness_eff,
    v.bezelWidth,
    surf,
    state.refractiveIndex,
    512
  );
  const maxAbs = disp1D.reduce((m: number, val: number) => Math.max(m, Math.abs(val)), 1);
  const img = calculateDisplacementMap2(
    v.width,
    v.height,
    v.radius,
    v.bezelWidth,
    maxAbs,
    disp1D
  );
  
  if (cache.dispUrl) URL.revokeObjectURL(cache.dispUrl);
  cache.dispUrl = await imageDataToBlobURL(img);
  cache.dispKey = dispKey;
  cache.dispImg = img;
  if (feMap && cache.dispUrl) {
    feMap.setAttributeNS('http://www.w3.org/1999/xlink', 'href', cache.dispUrl);
    feMap.setAttribute('href', cache.dispUrl);
  }
}

/**
 * Conditionally rebuild the specular highlight image.  The specular image is
 * only generated when specular highlights are enabled.  Otherwise a tiny
 * transparent image is used in its place.
 *
 * @param v       Validated geometry describing the shape
 * @param state   Highlight parameters
 * @param specImgEl The `<feImage>` element whose href should be updated
 */
export async function rebuildSpecularIfNeeded(
  v: any,
  state: { specularAngleDeg: number; specularStrength: number; showSpecular: boolean },
  specImgEl: SVGImageElement | undefined
) {
  const specKey = JSON.stringify({
    w: v.width,
    h: v.height,
    r: v.radius,
    b: v.bezelWidth,
    a: state.specularAngleDeg,
    s: state.specularStrength,
    on: state.showSpecular,
  });
  if (cache.specKey === specKey) return;
  
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
      state.specularStrength
    );
    cache.specUrl = await imageDataToBlobURL(specImg);
  }
  cache.specKey = specKey;
  if (specImgEl) {
    const url = cache.specUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    specImgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    specImgEl.setAttribute('href', url);
  }
}