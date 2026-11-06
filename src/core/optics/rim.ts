/**
 * Rim light shared by the displacement map (blue channel) and the standalone specular map.
 */

/** Unit light direction for an angle in degrees, y-down screen coordinates. */
export function lightVector(angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

/** Gaussian rim thickness in device px (never below half a pixel). */
export function rimThickness(rimPx: number | undefined, dpr: number): number {
  return Math.max(0.5, (rimPx ?? 2) * dpr);
}

/**
 * Rim-light coefficient in [0,1] for a band pixel: Gaussian falloff from the outer edge
 * (sigma = T, cut at 3 sigma) weighted by how well the outward normal aligns with the light
 * direction or its opposite.
 */
export function rimCoefficient(nx: number, ny: number, t: number, vx: number, vy: number, T: number): number {
  if (t > 3 * T) return 0;
  const align = Math.abs(nx * vx + ny * vy);
  const rim = Math.exp(-(t * t) / (2 * T * T));
  return Math.min(1, align * rim);
}
