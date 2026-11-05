import { createRGBAImage, type RGBAImage } from '../image.js';
import { forEachBandPixel } from './band.js';

export interface SpecularMapOptions {
  /** Effect size in CSS px. */
  width: number;
  height: number;
  /** Corner radius, CSS px. */
  radius: number;
  /** Bezel band width, CSS px (decides band membership only). */
  bezelWidth: number;
  /** Device pixel ratio. Required: core never reads `window`. */
  dpr: number;
  /** Light direction in degrees, screen coordinates. */
  angleDeg: number;
  /** Brightness multiplier, clamped to [0, 1] here (the filter's slope handles > 1). */
  strength: number;
  /** Gaussian rim width at the outer edge, CSS px. Default 2. */
  rimPx?: number;
}

/**
 * Grayscale rim highlight: a Gaussian band hugging the outer edge, weighted by how well the
 * outward normal aligns with the light direction (symmetric: `angle` and `angle + 180`
 * give the same image). Packed identically into RGB and alpha so it composites additively.
 * Corners use the same normal convention as the straight edges, so the highlight is
 * continuous around the shape.
 */
export function specularMap(opts: SpecularMapOptions): RGBAImage {
  const { dpr, angleDeg } = opts;
  const W = Math.round(opts.width * dpr);
  const H = Math.round(opts.height * dpr);
  const R = Math.round(opts.radius * dpr);
  const B = Math.max(1, Math.round(opts.bezelWidth * dpr));
  const strength = Math.max(0, Math.min(1, opts.strength));
  const T = Math.max(0.5, (opts.rimPx ?? 2) * dpr); // band thickness in px
  const vx = Math.cos((angleDeg * Math.PI) / 180);
  const vy = Math.sin((angleDeg * Math.PI) / 180);

  const img = createRGBAImage(W, H);
  const data = img.data;

  forEachBandPixel(W, H, R, B, (p) => {
    if (p.t > 3 * T) return;
    const align = Math.abs(p.nx * vx + p.ny * vy);
    // Gaussian falloff centered at the outer edge (t = 0)
    const rim = Math.exp(-(p.t * p.t) / (2 * T * T));
    const coeff = Math.min(1, align * rim * strength);
    const c = Math.floor(255 * coeff);
    data[p.idx] = c;
    data[p.idx + 1] = c;
    data[p.idx + 2] = c;
    data[p.idx + 3] = c;
  });
  return img;
}
