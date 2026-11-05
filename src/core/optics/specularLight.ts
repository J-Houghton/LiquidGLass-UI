import { createRGBAImage, type RGBAImage } from '../image.js';
import { forEachBandPixel } from './band.js';
import { lightVector, rimCoefficient, rimThickness } from './rim.js';

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
  /** Brightness multiplier, clamped to [0, 1]. */
  strength: number;
  /** Gaussian rim width at the outer edge, CSS px. Default 2. */
  rimPx?: number;
}

/**
 * Standalone grayscale rim highlight: a Gaussian band hugging the outer edge, weighted by how
 * well the outward normal aligns with the light direction (symmetric: `angle` and `angle + 180`
 * give the same image). Packed identically into RGB and alpha so it composites additively.
 *
 * The filter pipeline does not use this image: it reads the same rim from the displacement
 * map's blue channel (see `displacementMap({ rim })`). This function exists for consumers who
 * want the highlight as its own texture.
 */
export function specularMap(opts: SpecularMapOptions): RGBAImage {
  const { dpr, angleDeg } = opts;
  const W = Math.round(opts.width * dpr);
  const H = Math.round(opts.height * dpr);
  const R = Math.round(opts.radius * dpr);
  const B = Math.max(1, Math.round(opts.bezelWidth * dpr));
  const strength = Math.max(0, Math.min(1, opts.strength));
  const T = rimThickness(opts.rimPx, dpr);
  const [vx, vy] = lightVector(angleDeg);

  const img = createRGBAImage(W, H);
  const data = img.data;

  forEachBandPixel(W, H, R, B, (p) => {
    const c = Math.floor(255 * Math.min(1, rimCoefficient(p.nx, p.ny, p.t, vx, vy, T) * strength));
    if (c === 0) return;
    data[p.idx] = c;
    data[p.idx + 1] = c;
    data[p.idx + 2] = c;
    data[p.idx + 3] = c;
  });
  return img;
}
