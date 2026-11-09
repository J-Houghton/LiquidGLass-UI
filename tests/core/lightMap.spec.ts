/**
 * Pins the light map: R,G = Gaussian rim × outward normal (128 bias), B = shade profile, A = 255.
 * Independent of the light direction; the filter applies the light vector.
 */
import { describe, it, expect } from 'vitest';
import { displacementCurve } from '../../src/core/optics/disp1d';
import { displacementMap, lightMap, lensMaps, stretchProfile, LIGHT_NEUTRAL, RIM_NEUTRAL } from '../../src/core/optics/disp2d';
import { specularMap } from '../../src/core/optics/specularLight';
import type { SurfaceKind } from '../../src/core/optics/surfaces';
import { expectToMatchFixture } from '../helpers/fixtures';
import { blockMeans, pixel, everyPixel, type ImageLike } from '../helpers/image';

type Case = { name: string; w: number; h: number; r: number; b: number; dpr: number; surface?: SurfaceKind; ior?: number; glass?: number };

const CASES: Case[] = [
  { name: 'rect-300x120-r60-b60-dpr1', w: 300, h: 120, r: 60, b: 60, dpr: 1 },
  { name: 'rect-300x120-r60-b60-dpr2', w: 300, h: 120, r: 60, b: 60, dpr: 2 },
  { name: 'circle-200-r100-b100-dpr1', w: 200, h: 200, r: 100, b: 100, dpr: 1, surface: 'convex_circle', ior: 1.6, glass: 100 },
  { name: 'rect-300x120-r60-b50-lip-dpr1', w: 300, h: 120, r: 60, b: 50, dpr: 1, surface: 'lip', glass: 40 },
  { name: 'rect-300x120-r30-b30-concave-dpr1', w: 300, h: 120, r: 30, b: 30, dpr: 1, surface: 'concave', ior: 1.4, glass: 60 },
];

const curveFor = (c: Case) =>
  displacementCurve({ glassThickness: c.glass ?? 31.25, bezelWidth: c.b, refractiveIndex: c.ior ?? 1.5, surface: c.surface ?? 'convex_squircle' });

const build = (c: Case, shade = true): ImageLike =>
  lightMap({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: c.dpr, curve: curveFor(c), shade });

/** |g·n · L| reconstructed from the map, in [0, 1]. */
function lit(img: ImageLike, x: number, y: number, angleDeg: number): number {
  const [r, g] = pixel(img, x, y);
  const a = (angleDeg * Math.PI) / 180;
  return Math.abs(((r - LIGHT_NEUTRAL) / 127) * Math.cos(a) + ((g - LIGHT_NEUTRAL) / 127) * Math.sin(a));
}

describe('lightMap', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const img = build(c);
      const W = img.width;
      const H = img.height;
      const T = 2 * c.dpr;

      it('block means are pinned', () => {
        expectToMatchFixture(`light/${c.name}`, { width: W, height: H, blocks: blockMeans(img, 10 * c.dpr) }, 0.5);
      });

      it('alpha is 255 everywhere; outside the shape and beyond 3 sigma of the rim R,G are neutral', () => {
        expect(everyPixel(img, (_r, _g, _b, a) => a === 255)).toBe(true);
        expect(pixel(img, 0, 0).slice(0, 3)).toEqual([LIGHT_NEUTRAL, LIGHT_NEUTRAL, 0]);
        expect(pixel(img, W >> 1, 10 * c.dpr).slice(0, 2)).toEqual([LIGHT_NEUTRAL, LIGHT_NEUTRAL]);
        expect(pixel(img, 10 * c.dpr, H >> 1).slice(0, 2)).toEqual([LIGHT_NEUTRAL, LIGHT_NEUTRAL]);
      });

      it('the top rim pixel carries the outward normal (0, -1) times the Gaussian at t = 0.5', () => {
        const [r, g] = pixel(img, W >> 1, 0);
        const expectedG = Math.round(LIGHT_NEUTRAL - 127 * Math.exp(-0.25 / (2 * T * T)));
        expect(Math.abs(r - LIGHT_NEUTRAL)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - expectedG)).toBeLessThanOrEqual(1);
      });

      it('R flips across the vertical axis, G across the horizontal one; B is symmetric under both', () => {
        for (let y = 0; y < H; y += 7) {
          for (let x = 0; x < W; x += 5) {
            const a = pixel(img, x, y);
            const h = pixel(img, W - 1 - x, y);
            const v = pixel(img, x, H - 1 - y);
            expect(Math.abs(a[0] + h[0] - 2 * LIGHT_NEUTRAL)).toBeLessThanOrEqual(1);
            expect(Math.abs(a[1] - h[1])).toBeLessThanOrEqual(1);
            expect(Math.abs(a[1] + v[1] - 2 * LIGHT_NEUTRAL)).toBeLessThanOrEqual(1);
            expect(Math.abs(a[0] - v[0])).toBeLessThanOrEqual(1);
            expect(a[2]).toBe(h[2]);
            expect(a[2]).toBe(v[2]);
          }
        }
      });

      for (const angle of [60, 135, 90]) {
        it(`reconstructs the standalone specular map for a ${angle}° light (two-sided |n·L|)`, () => {
          const spec = specularMap({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: c.dpr, angleDeg: angle, strength: 1 });
          expect(everyPixel(img, (_r, _g, _b, _a, x, y) => Math.abs(lit(img, x, y, angle) - spec.data[(y * W + x) * 4] / 255) <= 2 / 127)).toBe(true);
        });
      }

      it('B is the stretch profile of the curve, sampled by depth into the band', () => {
        const curve = curveFor(c);
        const stretch = stretchProfile(curve);
        const Bpx = Math.max(1, Math.round(c.b * c.dpr));
        const n = curve.length;
        // walk down from the top edge at mid-width: t = y + 0.5, u = t / B, i0 = floor(u (n − 1))
        let checked = 0;
        for (let y = 0; y < Bpx && y < H >> 1; y++) {
          const u = Math.min(1, (y + 0.5) / Bpx);
          const i0 = Math.min(stretch.length - 1, Math.floor(u * (n - 1)));
          const expected = Math.round(255 * stretch[i0]);
          expect(Math.abs(pixel(img, W >> 1, y)[2] - expected)).toBeLessThanOrEqual(1);
          checked += 1;
        }
        expect(checked).toBeGreaterThan(5);
        if (c.w > 2 * c.b && c.h > 2 * c.b) expect(pixel(img, W >> 1, H >> 1)[2]).toBe(0); // flat center: no shade
      });

      it('shade: false leaves B at 0 everywhere', () => {
        expect(everyPixel(build(c, false), (_r, _g, b) => b === 0)).toBe(true);
      });
    });
  }

  it('lensMaps returns the displacement map without lighting and the light map, from one walk', () => {
    const c = CASES[0];
    const curve = curveFor(c);
    const pair = lensMaps({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: c.dpr, curve });
    const map = displacementMap({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: c.dpr, curve });
    const light = lightMap({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: c.dpr, curve });
    expect(Buffer.from(pair.map.data).equals(Buffer.from(map.data))).toBe(true);
    expect(Buffer.from(pair.light.data).equals(Buffer.from(light.data))).toBe(true);
    expect(everyPixel(pair.map, (_r, _g, b) => b === RIM_NEUTRAL)).toBe(true);
  });

  it('rimPx widens the Gaussian', () => {
    const c = CASES[0];
    const wide = lightMap({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: 1, curve: curveFor(c), rimPx: 6 });
    const narrow = build(c);
    const W = wide.width;
    expect(LIGHT_NEUTRAL - pixel(wide, W >> 1, 4)[1]).toBeGreaterThan(LIGHT_NEUTRAL - pixel(narrow, W >> 1, 4)[1]);
  });
});
