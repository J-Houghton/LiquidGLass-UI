import { describe, it, expect } from 'vitest';
import { forEachBandPixel, inRoundedRect, type BandPixel } from '../../src/core/optics/band';

type Visit = { nx: number; ny: number; t: number; corner: boolean };

/** Straightforward per-pixel reference: the pre-mirroring implementation, pixel centers included. */
function naiveWalk(W: number, H: number, R: number, B: number): Map<number, Visit> {
  const out = new Map<number, Visit>();
  const Rin = Math.max(0, R - B);
  const W2 = Math.max(0, W - 2 * B);
  const H2 = Math.max(0, H - 2 * B);
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      if (!inRoundedRect(px, py, W, H, R)) continue;
      if (W2 > 0 && H2 > 0 && inRoundedRect(px - B, py - B, W2, H2, Rin)) continue;
      const onL = px < R;
      const onR = px > W - R;
      const onT = py < R;
      const onB = py > H - R;
      let v: Visit;
      if ((onL || onR) && (onT || onB)) {
        const cx = onL ? px - R : px - (W - R);
        const cy = onT ? py - R : py - (H - R);
        const dist = Math.max(1e-6, Math.hypot(cx, cy));
        v = { nx: cx / dist, ny: cy / dist, t: R - dist, corner: true };
      } else {
        const dL = px;
        const dR = W - px;
        const dT = py;
        const dB = H - py;
        const m = Math.min(dL, dR, dT, dB);
        if (m === dT) v = { nx: 0, ny: -1, t: dT, corner: false };
        else if (m === dB) v = { nx: 0, ny: 1, t: dB, corner: false };
        else if (m === dL) v = { nx: -1, ny: 0, t: dL, corner: false };
        else v = { nx: 1, ny: 0, t: dR, corner: false };
      }
      out.set((y * W + x) * 4, v);
    }
  }
  return out;
}

function mirroredWalk(W: number, H: number, R: number, B: number): Map<number, Visit> {
  const out = new Map<number, Visit>();
  forEachBandPixel(W, H, R, B, (p: BandPixel) => {
    expect(p.idx).toBe((p.y * W + p.x) * 4);
    expect(out.has(p.idx)).toBe(false); // each pixel exactly once
    out.set(p.idx, { nx: p.nx, ny: p.ny, t: p.t, corner: p.corner });
  });
  return out;
}

const CASES: [number, number, number, number][] = [
  [300, 120, 60, 60], // stadium, bezel covers everything
  [301, 121, 60, 60], // odd sizes: center column and row must not be visited twice
  [300, 120, 30, 30], // flat interior
  [200, 200, 100, 100], // full dome
  [7, 7, 3, 2], // tiny
  [40, 10, 0, 3], // no rounding at all
  [50, 50, 25, 40], // bezel wider than radius
];

describe('forEachBandPixel (quadrant-mirrored)', () => {
  for (const [W, H, R, B] of CASES) {
    it(`${W}x${H} r${R} b${B}: identical to the naive full walk`, () => {
      const ref = naiveWalk(W, H, R, B);
      const got = mirroredWalk(W, H, R, B);
      expect(got.size).toBe(ref.size);
      for (const [idx, v] of ref) {
        const g = got.get(idx)!;
        expect(g).toBeDefined();
        expect(g.corner).toBe(v.corner);
        expect(g.t).toBeCloseTo(v.t, 12);
        expect(g.nx).toBeCloseTo(v.nx, 12);
        expect(g.ny).toBeCloseTo(v.ny, 12);
      }
    });
  }

  it('visits the whole shape when the bezel covers it and nothing inside otherwise', () => {
    let n = 0;
    forEachBandPixel(300, 120, 60, 60, () => n++);
    let full = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 300; x++) if (inRoundedRect(x + 0.5, y + 0.5, 300, 120, 60)) full++;
    expect(n).toBe(full);
    let m = 0;
    forEachBandPixel(300, 120, 30, 30, () => m++);
    expect(m).toBeLessThan(n);
  });
});
