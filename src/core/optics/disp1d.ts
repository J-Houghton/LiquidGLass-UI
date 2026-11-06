import { SURFACE_FNS, type SurfaceFn, type SurfaceKind } from './surfaces.js';

export interface DisplacementCurveOptions {
  /** Thickness of the flat interior glass, px. */
  glassThickness: number;
  /** Width of the bezel band, px. The bezel profile is assumed as tall as it is wide. */
  bezelWidth: number;
  /** Index of refraction of the glass. 1.0 means no refraction. */
  refractiveIndex: number;
  /** Bezel height profile on [0,1] (0 = outer rim), by name or as a function. */
  surface: SurfaceKind | SurfaceFn;
  /** Number of samples across the bezel. Default 512. */
  samples?: number;
}

/**
 * One-dimensional refraction displacement across the bezel.
 *
 * At each sample the surface normal is taken from the profile's slope, a vertical incident
 * ray is refracted into the glass with Snell's law (the standard `refract` formula), and
 * the refracted direction is projected over the remaining optical path (bezel height plus
 * glass thickness). The result is the horizontal distance, in px, the ray lands from where
 * it entered. A soft-knee limiter tames grazing-angle spikes while staying linear elsewhere.
 *
 * Samples are at x = i / samples, so they cover [0, 1). Pure: no DOM, no globals.
 */
export function displacementCurve(opts: DisplacementCurveOptions): Float64Array {
  const { glassThickness, bezelWidth, refractiveIndex } = opts;
  const samples = opts.samples ?? 512;
  const fn: SurfaceFn = typeof opts.surface === 'function' ? opts.surface : SURFACE_FNS[opts.surface].fn;
  const eta = 1 / refractiveIndex;

  const out = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = fn(x);
    const dx = x < 1 ? 1e-4 : -1e-4;
    const y2 = fn(x + dx);

    const dydx = (y2 - y) / dx;
    const mag = Math.sqrt(dydx * dydx + 1);
    const nx = -dydx / mag;
    const ny = -1 / mag;

    // refract((0,1), n, eta)
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) {
      out[i] = 0; // total internal reflection (unreachable for IOR > 1)
      continue;
    }
    const r = Math.sqrt(k);
    const rx = -(eta * dot + r) * nx;
    const ry = eta - (eta * dot + r) * ny;

    const remaining = y * bezelWidth + glassThickness;
    // Guard against near-grazing refraction where ry ~ 0
    const denom = Math.sign(ry) * Math.max(1e-3, Math.abs(ry));
    const rawDisp = rx * (remaining / denom);
    // Soft-knee limiter to avoid runaway peaks while keeping a linear feel
    const knee = Math.max(1, glassThickness + bezelWidth);
    out[i] = rawDisp / (1 + Math.abs(rawDisp) / knee);
  }
  return out;
}
