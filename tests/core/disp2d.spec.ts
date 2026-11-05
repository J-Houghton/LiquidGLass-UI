import { describe, it, expect } from 'vitest';
import { calculateDisplacementMap } from '../../src/core/optics/disp1d';
import { calculateDisplacementMap2 } from '../../src/core/optics/disp2d';
import { SURFACE_FNS, type SurfaceKind } from '../../src/core/optics/surfaces';
import { expectToMatchFixture } from '../helpers/fixtures';
import { blockMeans, pixel, everyPixel, channelMean, type ImageLike } from '../helpers/image';

type Case = {
  name: string;
  w: number;
  h: number;
  r: number;
  b: number;
  dpr: number;
  surface?: SurfaceKind;
  ior?: number;
  glass?: number;
  cbf?: number;
};

const CASES: Case[] = [
  { name: 'rect-300x120-r60-b60-dpr1', w: 300, h: 120, r: 60, b: 60, dpr: 1 },
  { name: 'rect-300x120-r60-b60-dpr2', w: 300, h: 120, r: 60, b: 60, dpr: 2 },
  { name: 'circle-200-r100-b100-dpr1', w: 200, h: 200, r: 100, b: 100, dpr: 1, surface: 'convex_circle', ior: 1.6, glass: 100 },
  { name: 'rect-300x120-r60-b50-lip-dpr1', w: 300, h: 120, r: 60, b: 50, dpr: 1, surface: 'lip', glass: 40 },
  { name: 'rect-300x120-r30-b30-concave-cbf2-dpr1', w: 300, h: 120, r: 30, b: 30, dpr: 1, surface: 'concave', ior: 1.4, glass: 60, cbf: 2 },
];

function build(c: Case): ImageLike {
  const surface = c.surface ?? 'convex_squircle';
  const curve = calculateDisplacementMap(c.glass ?? 31.25, c.b, SURFACE_FNS[surface].fn, c.ior ?? 1.5, 512);
  const maxAbs = curve.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
  return calculateDisplacementMap2(c.w, c.h, c.r, c.b, maxAbs, curve, c.dpr, c.cbf ?? 4) as unknown as ImageLike;
}

const NEUTRAL = [128, 128, 0, 255];

describe('disp2d: rounded-rect displacement map', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const img = build(c);
      const W = img.width;
      const H = img.height;

      it('block means are pinned', () => {
        expectToMatchFixture(`disp2d/${c.name}`, { width: W, height: H, blocks: blockMeans(img, 10 * c.dpr) }, 0.5);
      });

      it('has DPR-scaled dimensions', () => {
        expect(W).toBe(Math.round(c.w * c.dpr));
        expect(H).toBe(Math.round(c.h * c.dpr));
      });

      it('alpha is 255 everywhere (no transparent pixels for the filter to premultiply)', () => {
        expect(everyPixel(img, (_r, _g, _b, a) => a === 255)).toBe(true);
      });

      it('center pixel and the outside-corner pixel are neutral', () => {
        expect(pixel(img, W >> 1, H >> 1)).toEqual(NEUTRAL);
        expect(pixel(img, 0, 0)).toEqual(NEUTRAL);
      });

      it('rim pixels carry a full chromatic mask and a purely normal displacement', () => {
        const top = pixel(img, W >> 1, 0);
        const left = pixel(img, 0, H >> 1);
        expect(top[2]).toBe(255);
        expect(left[2]).toBe(255);
        expect(top[0]).toBe(128); // top edge normal is vertical: no x displacement
        expect(left[1]).toBe(128); // left edge normal is horizontal: no y displacement
      });

      // Only straight-edge pairs mirror exactly. In corner sectors the right/bottom side sits one
      // pixel further into the band than the left/top side (corner distance is `R - dist`, flat
      // distance is `W - 1 - x`), which the fixtures pin and the plan lists as a known quirk.
      it('opposite straight-edge rim pixels displace in opposite directions', () => {
        const R = Math.round(c.r * c.dpr);
        if (W > 2 * R) {
          const top = pixel(img, W >> 1, 0);
          const bottom = pixel(img, W >> 1, H - 1);
          expect(Math.abs(top[1] + bottom[1] - 256)).toBeLessThanOrEqual(1);
        }
        if (H > 2 * R) {
          const left = pixel(img, 0, H >> 1);
          const right = pixel(img, W - 1, H >> 1);
          expect(Math.abs(left[0] + right[0] - 256)).toBeLessThanOrEqual(1);
        }
      });

      it('is grossly mirror-symmetric in both axes', () => {
        const rL = channelMean(img, 0, 0, 0, W >> 1, H);
        const rR = channelMean(img, 0, W - (W >> 1), 0, W, H);
        const gT = channelMean(img, 1, 0, 0, W, H >> 1);
        const gB = channelMean(img, 1, 0, H - (H >> 1), W, H);
        expect(Math.abs(rL + rR - 256)).toBeLessThan(2);
        expect(Math.abs(gT + gB - 256)).toBeLessThan(2);
        const bL = channelMean(img, 2, 0, 0, W >> 1, H);
        const bR = channelMean(img, 2, W - (W >> 1), 0, W, H);
        expect(Math.abs(bL - bR)).toBeLessThan(1);
      });
    });
  }

  it('chromatic mask fades quadratically and vanishes at 1/factor of the bezel', () => {
    const img = build(CASES[0]); // dpr 1, bezel 60, factor 4 -> mask ends at 15px
    const x = img.width >> 1;
    const b0 = pixel(img, x, 0)[2];
    const b5 = pixel(img, x, 5)[2];
    const b10 = pixel(img, x, 10)[2];
    const b15 = pixel(img, x, 15)[2];
    expect(b0).toBe(255);
    expect(b5).toBeGreaterThan(b10);
    expect(b10).toBeGreaterThan(b15);
    expect(b15).toBe(0);
    expect(pixel(img, x, 40)[2]).toBe(0);
  });

  it('uses a wider mask when the factor is smaller', () => {
    const narrow = build({ ...CASES[0], cbf: 4 });
    const wide = build({ ...CASES[0], cbf: 2 });
    const x = narrow.width >> 1;
    expect(pixel(wide, x, 20)[2]).toBeGreaterThan(0);
    expect(pixel(narrow, x, 20)[2]).toBe(0);
  });
});
