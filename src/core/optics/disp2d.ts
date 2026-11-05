import { createRGBAImage, type RGBAImage } from '../image.js';
import { forEachBandPixel } from './band.js';
import { lightVector, rimCoefficient, rimThickness } from './rim.js';

export interface DisplacementMapOptions {
  /** Effect size in CSS px. */
  width: number;
  height: number;
  /** Corner radius, CSS px. */
  radius: number;
  /** Bezel band width, CSS px. */
  bezelWidth: number;
  /** Device pixel ratio. Required: core never reads `window`. */
  dpr: number;
  /** 1D displacement curve across the bezel (see displacementCurve), indexed 0 = rim. */
  curve: ArrayLike<number>;
  /**
   * Value the curve is normalized by so the map fits 8 bits. Defaults to max(1, max|curve|).
   * The map therefore encodes the *shape* of the displacement; the magnitude in px is set
   * by the filter's `scale` attribute.
   */
  maxDisplacement?: number;
  /**
   * Bake a rim light into the blue channel (full strength; the filter scales it). Omit for B = 0.
   */
  rim?: { angleDeg: number; rimPx?: number };
}

/**
 * Rasterize the 1D curve into a rounded-rectangle bezel band.
 *
 * Per pixel: R,G = displacement vector pointing inward (128 bias, 127 scale), B = rim light
 * (0 when `rim` is omitted), A = 255. Pixels outside the band (the flat center and outside the
 * shape) stay neutral (128,128,0,255), so the map never introduces transparency.
 */
export function displacementMap(opts: DisplacementMapOptions): RGBAImage {
  const { dpr, curve } = opts;
  const W = Math.round(opts.width * dpr);
  const H = Math.round(opts.height * dpr);
  const R = Math.round(opts.radius * dpr);
  const B = Math.max(1, Math.round(opts.bezelWidth * dpr));
  const maxDisp = opts.maxDisplacement ?? maxAbs(curve);
  const n = curve.length;
  const rim = opts.rim;
  const T = rim ? rimThickness(rim.rimPx, dpr) : 0;
  const [vx, vy] = rim ? lightVector(rim.angleDeg) : [0, 0];

  const img = createRGBAImage(W, H);
  // R=128, G=128 (zero vector), B=0 (no rim), A=255. Little-endian ABGR.
  new Uint32Array(img.data.buffer).fill(0xff008080);
  const data = img.data;

  forEachBandPixel(W, H, R, B, (p) => {
    const u = Math.max(0, Math.min(1, p.t / B)); // [0..1] across the bezel

    // linear interpolation into the curve
    const f = u * (n - 1);
    const i0 = Math.max(0, Math.floor(f));
    const i1 = Math.min(n - 1, i0 + 1);
    const w1 = f - i0;
    const w0 = 1 - w1;
    const disp = (curve[i0] ?? 0) * w0 + (curve[i1] ?? 0) * w1;

    // outward normal -> use -n for the inward refraction feel
    const dX = (-p.nx * disp) / maxDisp;
    const dY = (-p.ny * disp) / maxDisp;
    data[p.idx] = 128 + dX * 127;
    data[p.idx + 1] = 128 + dY * 127;
    data[p.idx + 2] = rim ? Math.floor(255 * rimCoefficient(p.nx, p.ny, p.t, vx, vy, T)) : 0;
    data[p.idx + 3] = 255;
  });
  return img;
}

/** max(1, max |v|): the normalization the engine applies to a curve. */
export function maxAbs(curve: ArrayLike<number>): number {
  let m = 1;
  for (let i = 0; i < curve.length; i++) m = Math.max(m, Math.abs(curve[i]));
  return m;
}
