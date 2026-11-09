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
  /** 1D displacement curve across the bezel (see displacementCurve), in CSS px, indexed 0 = rim. */
  curve: ArrayLike<number>;
  /**
   * Value the curve is normalized by so the map fits 8 bits. Defaults to max(1, max|curve|).
   * The map therefore encodes the *shape* of the displacement; the magnitude in px is set
   * by the filter's `scale` attribute.
   */
  maxDisplacement?: number;
  /**
   * Bake lighting into the blue channel (128 = neutral). Light above 128: the Gaussian rim facing
   * the light, at full strength (the filter scales it). Shade below 128 (unless `shade: false`):
   * the normalized stretch profile of the lens, 1 where the backdrop is thinned the most
   * (the steepest part of the curve, just inside the rim) fading to 0 where the glass is flat.
   * The filter scales it by the `shade` parameter. Omit `rim` for B = 128 everywhere.
   */
  rim?: { angleDeg: number; rimPx?: number; shade?: boolean };
}

/** Blue-channel value for "no light, no shade". */
export const RIM_NEUTRAL = 128;

/**
 * Rasterize the 1D curve into a rounded-rectangle bezel band.
 *
 * Per pixel: R,G = displacement vector pointing inward (128 bias, 127 scale), B = signed lighting
 * (128 neutral, see `rim`), A = 255. Pixels outside the band (the flat center and outside the
 * shape) stay neutral (128,128,128,255), so the map never introduces transparency.
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
  const withShade = !!rim && rim.shade !== false;
  const stretch = withShade ? stretchProfile(curve) : null;

  const img = createRGBAImage(W, H);
  // R=128, G=128 (zero vector), B=128 (neutral light), A=255. Little-endian ABGR.
  new Uint32Array(img.data.buffer).fill(0xff808080);
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

    const lit = rim ? rimCoefficient(p.nx, p.ny, p.t, vx, vy, T) : 0;
    const shadeTerm = stretch ? stretch[Math.min(stretch.length - 1, i0)] : 0;
    data[p.idx + 2] = Math.round(RIM_NEUTRAL + 127 * Math.max(-1, Math.min(1, lit - shadeTerm)));
    data[p.idx + 3] = 255;
  });
  return img;
}

/**
 * For each curve interval, 1 + dΔ/dt: the ratio between backdrop spacing and screen spacing when
 * the physical displacement Δ(t) is applied along the inward axis t (both in CSS px). Below 1 the
 * backdrop is stretched (thinned), above 1 compressed. Informational; the baked shade uses the
 * normalized {@link stretchProfile} because raw gains saturate near the rim.
 */
export function densityGain(curve: ArrayLike<number>, bezelWidthCssPx: number): Float64Array {
  const n = curve.length;
  const out = new Float64Array(Math.max(1, n - 1));
  if (n < 2) {
    out[0] = 1;
    return out;
  }
  const du = bezelWidthCssPx / (n - 1); // CSS px between consecutive samples
  for (let i = 0; i < n - 1; i++) out[i] = 1 + (curve[i + 1] - curve[i]) / Math.max(1e-6, du);
  return out;
}

/**
 * How much the lens thins the backdrop at each curve interval, normalized to [0, 1]: the inward
 * decrease of the displacement, divided by its largest decrease. 0 where the curve is flat or
 * compressing. A flat curve gives all zeros.
 */
export function stretchProfile(curve: ArrayLike<number>): Float64Array {
  const n = curve.length;
  const out = new Float64Array(Math.max(1, n - 1));
  let max = 0;
  for (let i = 0; i < n - 1; i++) {
    const v = Math.max(0, curve[i] - curve[i + 1]);
    out[i] = v;
    if (v > max) max = v;
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

/** max(1, max |v|): the normalization the engine applies to a curve. */
export function maxAbs(curve: ArrayLike<number>): number {
  let m = 1;
  for (let i = 0; i < curve.length; i++) m = Math.max(m, Math.abs(curve[i]));
  return m;
}

// ---- light map ------------------------------------------------------------------------------

export interface LightMapOptions {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  dpr: number;
  /** The displacement curve; its stretch profile becomes the shade channel. */
  curve: ArrayLike<number>;
  /** Gaussian width of the rim, CSS px. Default 2. */
  rimPx?: number;
  /** Bake the shade profile into B. Default true. */
  shade?: boolean;
}

/** R and G value of the light map where there is no rim. B is 0 where there is no shade. */
export const LIGHT_NEUTRAL = 128;

/**
 * The lighting companion of the displacement map, independent of the light direction:
 * R,G = Gaussian rim falloff times the outward unit normal (128 bias, 127 scale), B = the
 * normalized stretch profile (0..255, 1 where the lens thins the backdrop the most), A = 255.
 * The filter turns it into the lit rim for any light vector L with one colour matrix per side:
 * alpha = max(0, ±(g·n)·L), summed, so changing the light angle is an attribute write.
 */
export function lightMap(opts: LightMapOptions): RGBAImage {
  return rasterize(opts, false, true).light!;
}

export interface LensMaps {
  map: RGBAImage;
  light: RGBAImage;
}

/** Both images from one walk of the band (the displacement map carries no lighting). */
export function lensMaps(opts: LightMapOptions & { maxDisplacement?: number }): LensMaps {
  const r = rasterize(opts, true, true);
  return { map: r.map!, light: r.light! };
}

function rasterize(
  opts: LightMapOptions & { maxDisplacement?: number },
  wantMap: boolean,
  wantLight: boolean,
): { map?: RGBAImage; light?: RGBAImage } {
  const { dpr, curve } = opts;
  const W = Math.round(opts.width * dpr);
  const H = Math.round(opts.height * dpr);
  const R = Math.round(opts.radius * dpr);
  const B = Math.max(1, Math.round(opts.bezelWidth * dpr));
  const n = curve.length;
  const maxDisp = opts.maxDisplacement ?? maxAbs(curve);
  const T = rimThickness(opts.rimPx, dpr);
  const stretch = opts.shade === false ? null : stretchProfile(curve);

  const map = wantMap ? createRGBAImage(W, H) : null;
  const light = wantLight ? createRGBAImage(W, H) : null;
  if (map) new Uint32Array(map.data.buffer).fill(0xff808080); // (128,128,128,255)
  if (light) new Uint32Array(light.data.buffer).fill(0xff008080); // (128,128,0,255)
  const md = map?.data;
  const ld = light?.data;

  forEachBandPixel(W, H, R, B, (p) => {
    const u = Math.max(0, Math.min(1, p.t / B));
    const f = u * (n - 1);
    const i0 = Math.max(0, Math.floor(f));
    if (md) {
      const i1 = Math.min(n - 1, i0 + 1);
      const w1 = f - i0;
      const disp = (curve[i0] ?? 0) * (1 - w1) + (curve[i1] ?? 0) * w1;
      md[p.idx] = 128 + ((-p.nx * disp) / maxDisp) * 127;
      md[p.idx + 1] = 128 + ((-p.ny * disp) / maxDisp) * 127;
      md[p.idx + 2] = RIM_NEUTRAL;
      md[p.idx + 3] = 255;
    }
    if (ld) {
      const g = p.t > 3 * T ? 0 : Math.exp(-(p.t * p.t) / (2 * T * T));
      ld[p.idx] = Math.round(LIGHT_NEUTRAL + 127 * g * p.nx);
      ld[p.idx + 1] = Math.round(LIGHT_NEUTRAL + 127 * g * p.ny);
      ld[p.idx + 2] = stretch ? Math.round(255 * stretch[Math.min(stretch.length - 1, i0)]) : 0;
      ld[p.idx + 3] = 255;
    }
  });
  return { map: map ?? undefined, light: light ?? undefined };
}
