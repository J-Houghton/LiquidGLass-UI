import { describe, it, expect } from 'vitest';
import { specularMap } from '../../src/core/optics/specularLight';
import { expectToMatchFixture } from '../helpers/fixtures';
import { blockMeans, pixel, everyPixel, type ImageLike } from '../helpers/image';

type Case = { name: string; w: number; h: number; r: number; b: number; angle: number; strength: number; dpr: number };

const CASES: Case[] = [
  { name: 'rect-300x120-r60-b60-a60-s0.9-dpr1', w: 300, h: 120, r: 60, b: 60, angle: 60, strength: 0.9, dpr: 1 },
  { name: 'rect-300x120-r60-b60-a60-s0.9-dpr2', w: 300, h: 120, r: 60, b: 60, angle: 60, strength: 0.9, dpr: 2 },
  { name: 'circle-200-r100-b100-a135-s1.2-dpr1', w: 200, h: 200, r: 100, b: 100, angle: 135, strength: 1.2, dpr: 1 },
];

const build = (c: Case, angle = c.angle): ImageLike =>
  specularMap({ width: c.w, height: c.h, radius: c.r, bezelWidth: c.b, dpr: c.dpr, angleDeg: angle, strength: c.strength });

describe('specularLight: rim highlight image', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const img = build(c);
      const W = img.width;
      const H = img.height;

      it('block means are pinned', () => {
        expectToMatchFixture(`specular/${c.name}`, { width: W, height: H, blocks: blockMeans(img, 10 * c.dpr) }, 0.5);
      });

      it('is packed identically into RGB and alpha', () => {
        expect(everyPixel(img, (r, g, b, a) => r === g && g === b && b === a)).toBe(true);
      });

      it('is empty away from the rim (center, and beyond 3 sigma of the 2px rim)', () => {
        expect(pixel(img, W >> 1, H >> 1)).toEqual([0, 0, 0, 0]);
        expect(pixel(img, W >> 1, 10 * c.dpr)).toEqual([0, 0, 0, 0]);
        expect(pixel(img, 10 * c.dpr, H >> 1)).toEqual([0, 0, 0, 0]);
      });

      it('is identical for the light angle and its opposite', () => {
        const flipped = build(c, c.angle + 180);
        expect(Buffer.compare(Buffer.from(img.data.buffer), Buffer.from(flipped.data.buffer))).toBe(0);
      });
    });
  }

  it('top rim pixel at 60 degrees: alignment sin(60) x Gaussian rim at t=0.5 x strength 0.9', () => {
    const img = build(CASES[0]);
    const T = 2; // rim px at dpr 1
    const expected = Math.floor(255 * Math.min(1, Math.sin(Math.PI / 3) * Math.exp(-(0.5 * 0.5) / (2 * T * T)) * 0.9));
    expect(pixel(img, img.width >> 1, 0)).toEqual([expected, expected, expected, expected]);
    expect(expected).toBeGreaterThan(185);
  });

  it('corner normals are continuous with the edges: a 45-degree light lights the top-left and bottom-right corners only', () => {
    const img = build({ ...CASES[0], angle: 45, strength: 1 });
    const W = img.width;
    const H = img.height;
    const topLeft = pixel(img, 18, 18)[0]; // on the 45-degree rim of the top-left corner (R = 60)
    const topRight = pixel(img, W - 1 - 18, 18)[0];
    const bottomRight = pixel(img, W - 1 - 18, H - 1 - 18)[0];
    const bottomLeft = pixel(img, 18, H - 1 - 18)[0];
    expect(topLeft).toBeGreaterThan(150);
    expect(bottomRight).toBe(topLeft);
    expect(topRight).toBeLessThan(5);
    expect(bottomLeft).toBe(topRight);
  });

  it('is an exact mirror image across both axes for a vertical light', () => {
    const img = build({ ...CASES[0], angle: 90 });
    const W = img.width;
    const H = img.height;
    for (let y = 0; y < H; y += 3) {
      for (let x = 0; x < W; x += 5) {
        const a = pixel(img, x, y)[3];
        expect(pixel(img, W - 1 - x, y)[3]).toBe(a);
        expect(pixel(img, x, H - 1 - y)[3]).toBe(a);
      }
    }
  });

  it('strength is clamped to [0, 1] inside the image', () => {
    const base = CASES[0];
    const s1 = build({ ...base, strength: 1 });
    const s2 = build({ ...base, strength: 2 });
    expect(Buffer.compare(Buffer.from(s1.data.buffer), Buffer.from(s2.data.buffer))).toBe(0);
    const s0 = build({ ...base, strength: 0 });
    expect(everyPixel(s0, (_r, _g, _b, a) => a === 0)).toBe(true);
  });
});
