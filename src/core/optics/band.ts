/**
 * Shared geometry for the bezel band of a rounded rectangle, in device pixels.
 * Used by the displacement map and the specular map so both agree on which pixels are
 * in the band, which way the outward normal points, and how deep into the band a pixel is.
 *
 * Every pixel is evaluated at its center (x + 0.5, y + 0.5). That makes the corner sectors
 * and the straight edges agree on distance, and makes the band an exact mirror image across
 * both axes (pixel x ↔ W-1-x, y ↔ H-1-y). The walk exploits that symmetry: geometry is
 * computed for the top-left quadrant only and emitted four times with mirrored normals.
 */

export interface BandPixel {
  x: number;
  y: number;
  /** Byte offset of this pixel in an RGBA buffer. */
  idx: number;
  /** Outward unit normal, y-down screen coordinates. */
  nx: number;
  ny: number;
  /** Distance from the outer edge to the pixel center, px (0.5 for a rim pixel). */
  t: number;
  /** True in the four corner sectors, false along the straight edges. */
  corner: boolean;
}

/** Point-in-rounded-rectangle test for a point (x, y) in continuous coordinates. */
export function inRoundedRect(x: number, y: number, w: number, h: number, r: number): boolean {
  const onL = x < r;
  const onR = x > w - r;
  const onT = y < r;
  const onB = y > h - r;
  if ((onL || onR) && (onT || onB)) {
    const cx = onL ? x - r : x - (w - r);
    const cy = onT ? y - r : y - (h - r);
    return cx * cx + cy * cy <= r * r + 1e-6;
  }
  return x >= 0 && x < w && y >= 0 && y < h;
}

/**
 * Visit every pixel of the band: inside the outer rounded rectangle (W×H, radius R) and
 * outside the inner one inset by B. Visiting order is not row-major (quadrants are emitted
 * together); the visitor receives one reused object, so copy fields out to keep them.
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
  const halfW = Math.ceil(W / 2);
  const halfH = Math.ceil(H / 2);

  const emit = (x: number, y: number, nx: number, ny: number) => {
    p.x = x;
    p.y = y;
    p.idx = (y * W + x) * 4;
    p.nx = nx;
    p.ny = ny;
    visit(p);
  };

  for (let y = 0; y < halfH; y++) {
    const py = y + 0.5;
    const my = H - 1 - y;
    for (let x = 0; x < halfW; x++) {
      const px = x + 0.5;
      const mx = W - 1 - x;

      // Geometry for the top-left representative; its three mirrors share t and |normal|.
      if (!inRoundedRect(px, py, W, H, R)) continue;
      if (W2 > 0 && H2 > 0 && inRoundedRect(px - B, py - B, W2, H2, Rin)) continue;

      let nx: number;
      let ny: number;
      if (px < R && py < R) {
        const cx = px - R;
        const cy = py - R;
        const dist = Math.max(1e-6, Math.hypot(cx, cy));
        nx = cx / dist;
        ny = cy / dist;
        p.t = R - dist;
        p.corner = true;
      } else {
        // In the top-left quadrant the nearest edge is the top or the left one; ties go to the top.
        p.corner = false;
        if (py <= px) {
          nx = 0;
          ny = -1;
          p.t = py;
        } else {
          nx = -1;
          ny = 0;
          p.t = px;
        }
      }

      emit(x, y, nx, ny);
      if (mx !== x) emit(mx, y, -nx, ny);
      if (my !== y) emit(x, my, nx, -ny);
      if (mx !== x && my !== y) emit(mx, my, -nx, -ny);
    }
  }
}
