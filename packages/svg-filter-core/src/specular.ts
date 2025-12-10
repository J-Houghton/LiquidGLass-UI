/*
 * Specular highlight computation.
 *
 * The original project overlays a rim highlight on top of the refracted glass
 * using an SVG filter image.  This module exports a pure function that
 * generates a grayscale image representing that highlight.  The intensity
 * depends on the alignment between the surface normal and a user supplied
 * light direction, modulated by a Gaussian falloff from the rim and an
 * overall strength multiplier.
 */

import type { ImageDataLike } from './displacement.js';

/**
 * Build a grayscale specular highlight image.
 * Pixels outside the bezel band are fully transparent.  The highlight is
 * packed into both the RGB and alpha channels so that when composited
 * additively the light appears bright.  This function matches the behaviour
 * of the original `buildSpecularImage`.
 *
 * @param objectWidth  Width of the object in CSS pixels
 * @param objectHeight Height of the object in CSS pixels
 * @param radius       Corner radius of the rounded rectangle
 * @param bezelWidth   Width of the bezel band in pixels
 * @param angleDeg     Direction of incoming light measured in degrees
 * @param strength     Overall multiplier for highlight brightness
 * @param dpr          Optional device pixel ratio; defaults to 1 when omitted
 * @param outerSpecThicknessPx Gaussian falloff width at the rim in CSS px
 */
export function buildSpecularImage(
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  angleDeg: number,
  strength: number = 1,
  dpr: number = 1,
  outerSpecThicknessPx: number = 2,
): ImageDataLike {
  const DPR = dpr;
  const W = Math.round(objectWidth * DPR);
  const H = Math.round(objectHeight * DPR);
  const data = new Uint8ClampedArray(W * H * 4);
  // zero initialised by default

  const R = Math.round(radius * DPR);
  const B = Math.max(1, Math.round(bezelWidth * DPR));
  const Rin = Math.max(0, R - B);
  const W2 = Math.max(0, W - 2 * B);
  const H2 = Math.max(0, H - 2 * B);
  const vx = Math.cos((angleDeg * Math.PI) / 180);
  const vy = Math.sin((angleDeg * Math.PI) / 180);

  const inRR = (x: number, y: number, w: number, h: number, r: number): boolean => {
    const onL = x < r;
    const onR = x >= w - r;
    const onT = y < r;
    const onB = y >= h - r;
    if ((onL || onR) && (onT || onB)) {
      const flatW = w - 2 * r;
      const flatH = h - 2 * r;
      const cx = onL ? x - r : x - r - flatW;
      const cy = onT ? y - r : y - r - flatH;
      return (cx * cx + cy * cy) <= r * r + 1e-6;
    }
    return x >= 0 && x < w && y >= 0 && y < h;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      if (!inRR(x, y, W, H, R)) continue;
      if (W2 > 0 && H2 > 0 && inRR(x - B, y - B, W2, H2, Rin)) continue;

      // Determine surface normal and distance across the bezel.
      let nx = 0;
      let ny = 0;
      let t = 0;
      const onL = x < R;
      const onR = x >= W - R;
      const onT = y < R;
      const onB = y >= H - R;
      if ((onL || onR) && (onT || onB)) {
        const flatW = W - 2 * R;
        const flatH = H - 2 * R;
        const cx = onL ? x - R : x - R - flatW;
        const cy = onT ? y - R : y - R - flatH;
        const dist = Math.max(1e-6, Math.hypot(cx, cy));
        nx = cx / dist;
        ny = -cy / dist;
        t = R - dist;
      } else {
        const dL = x;
        const dR = W - 1 - x;
        const dT = y;
        const dB = H - 1 - y;
        const m = Math.min(dL, dR, dT, dB);
        if (m === dT) { nx = 0; ny = -1; t = dT; }
        else if (m === dB) { nx = 0; ny = +1; t = dB; }
        else if (m === dL) { nx = -1; ny = 0; t = dL; }
        else { nx = +1; ny = 0; t = dR; }
      }

      // Alignment between surface normal and light direction.  We take the
      // absolute value so that both left and right rims catch the light.
      const align = Math.max(0, Math.abs(nx * vx + ny * vy));
      // Convert outerSpecThicknessPx from CSS px into device pixels.
      const T = Math.max(0.5, outerSpecThicknessPx * DPR);
      if (t > 3 * T) continue;
      // Gaussian falloff centred at the rim (t=0).  The rim is brightest and
      // decays into the bezel.  Strength modulates the overall amplitude.
      const rim = Math.exp(-(t * t) / (2 * T * T));
      const coeff = Math.min(1, align * rim * Math.max(0, Math.min(1, strength)));
      const c = Math.floor(255 * coeff);
      data[idx + 0] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = c;
    }
  }

  return { width: W, height: H, data };
}