/**
 * Shared geometry for the bezel band of a rounded rectangle, in device pixels.
 * Used by the displacement map and the specular map so both agree on which pixels are
 * in the band, which way the outward normal points, and how deep into the band a pixel is.
 */

export interface BandPixel {
  x: number;
  y: number;
  /** Byte offset of this pixel in an RGBA buffer. */
  idx: number;
  /** Outward unit normal, y-down screen coordinates. */
  nx: number;
  ny: number;
  /** Distance into the band from the outer edge, px (0 at the rim). */
  t: number;
  /** True in the four corner sectors, false along the straight edges. */
  corner: boolean;
}

/** Point-in-rounded-rectangle test, matching the historical implementation exactly. */
export function inRoundedRect(x: number, y: number, w: number, h: number, r: number): boolean {
  const onL = x < r;
  const onR = x >= w - r;
  const onT = y < r;
  const onB = y >= h - r;
  if ((onL || onR) && (onT || onB)) {
    const flatW = w - 2 * r;
    const flatH = h - 2 * r;
    const cx = onL ? x - r : x - r - flatW;
    const cy = onT ? y - r : y - r - flatH;
    return cx * cx + cy * cy <= r * r + 1e-6;
  }
  return x >= 0 && x < w && y >= 0 && y < h;
}

/**
 * Visit every pixel of the band: inside the outer rounded rectangle (W×H, radius R) and
 * outside the inner one inset by B. The visitor receives one reused object; copy fields
 * out if you need to keep them.
 *
 * Known quirk, preserved on purpose and pinned by fixtures: corner distance is `R - dist`
 * while straight-edge distance is `W-1-x` / `H-1-y`, so the right and bottom sides sit one
 * pixel deeper into the band than the left and top. See the modernization plan, OQ-17.
 */
export function forEachBandPixel(
  W: number,
  H: number,
  R: number,
  B: number,
  visit: (p: BandPixel) => void,
): void {
  const Rin = Math.max(0, R - B);
  const W2 = Math.max(0, W - 2 * B);
  const H2 = Math.max(0, H - 2 * B);
  const p: BandPixel = { x: 0, y: 0, idx: 0, nx: 0, ny: 0, t: 0, corner: false };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inRoundedRect(x, y, W, H, R)) continue;
      if (W2 > 0 && H2 > 0 && inRoundedRect(x - B, y - B, W2, H2, Rin)) continue;

      p.x = x;
      p.y = y;
      p.idx = (y * W + x) * 4;

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
        p.nx = cx / dist;
        p.ny = cy / dist;
        p.t = R - dist;
        p.corner = true;
      } else {
        const dL = x;
        const dR = W - 1 - x;
        const dT = y;
        const dB = H - 1 - y;
        const m = Math.min(dL, dR, dT, dB);
        p.corner = false;
        if (m === dT) {
          p.nx = 0;
          p.ny = -1;
          p.t = dT;
        } else if (m === dB) {
          p.nx = 0;
          p.ny = 1;
          p.t = dB;
        } else if (m === dL) {
          p.nx = -1;
          p.ny = 0;
          p.t = dL;
        } else {
          p.nx = 1;
          p.ny = 0;
          p.t = dR;
        }
      }
      visit(p);
    }
  }
}
