/**
 * Compute a one‑dimensional refraction displacement profile across the bezel.
 * Each sample in the returned array represents the horizontal distance a vertically incident
 * light ray travels through the glass material before exiting the opposite surface.
 *
 * The function models Snell's law at the curved bezel interface: given a surface profile
 * function (`bezelHeightFn`) describing the shape of the outer surface from 0 to 1, the
 * routine calculates the surface normal at each sample, refracts a vertical incident ray
 * into the glass using the provided refractive index, then projects the refracted direction
 * over the remaining optical path length (`bezelWidth` + `glassThickness`).
 *
 * A soft knee limiter is applied to avoid extreme displacements near grazing angles.  This
 * curve is later normalized and packed into a 2D displacement map.
 *
 * @param glassThickness  Effective thickness of the interior glass region in px
 * @param bezelWidth      Width of the bezel band in px
 * @param bezelHeightFn   Parametric function describing bezel shape on [0,1]
 * @param refractiveIndex Index of refraction (IOR) for the glass
 * @param samples         Number of discrete samples across the bezel
 */
export function calculateDisplacementMap(
  glassThickness: number = 200,
  bezelWidth: number = 50,
  bezelHeightFn: (x: number) => number = (x) => x,
  refractiveIndex: number = 1.5,
  samples: number = 128
): number[] {
  const eta = 1 / refractiveIndex;

  function refract(nx: number, ny: number): [number, number] | null {
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const r = Math.sqrt(k);
    return [-(eta * dot + r) * nx, eta - (eta * dot + r) * ny];
  }

  const out = new Array<number>(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = bezelHeightFn(x);
    const dx = x < 1 ? 1e-4 : -1e-4;
    const y2 = bezelHeightFn(x + dx);

    const dydx = (y2 - y) / dx;
    const mag = Math.sqrt(dydx * dydx + 1);
    const nx = -dydx / mag;
    const ny = -1 / mag;

    const rvec = refract(nx, ny);
    if (!rvec) {
      out[i] = 0;
      continue;
    }
    const remaining = y * bezelWidth + glassThickness;
    // Guard against near-grazing refraction where rvec[1] ~ 0
    const denom = Math.sign(rvec[1]) * Math.max(1e-3, Math.abs(rvec[1]));
    const rawDisp = rvec[0] * (remaining / denom);
    // Soft-knee limiter to avoid runaway peaks while keeping linear feel
    const knee = Math.max(1, glassThickness + bezelWidth);
    out[i] = rawDisp / (1 + Math.abs(rawDisp) / knee);
  }
  return out;
}