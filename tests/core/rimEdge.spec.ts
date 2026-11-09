/**
 * The rim round a corner is drawn with coverage: where the arc cuts through a pixel, the pixel is
 * lit as much as the shape covers it, so the rim follows the arc smoothly instead of stepping
 * along the pixel grid (bright and dark pixels in turn, which shows as a dotted line on screen).
 */
import { describe, it, expect } from 'vitest';
import { displacementCurve } from '../../src/core/optics/disp1d';
import { lightMap, LIGHT_NEUTRAL } from '../../src/core/optics/disp2d';
import { specularMap } from '../../src/core/optics/specularLight';
import { edgeCoverage } from '../../src/core/optics/band';
import type { ImageLike } from '../helpers/image';

const curve = displacementCurve({ glassThickness: 31.25, bezelWidth: 46, refractiveIndex: 1.5, surface: 'convex_squircle' });

/** The rim's strength at a pixel, 0..1, from the light map's R,G. */
const rimAt = (img: ImageLike, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return Math.hypot(img.data[i] - LIGHT_NEUTRAL, img.data[i + 1] - LIGHT_NEUTRAL) / 127;
};

/** Bilinear, so a sample between pixel centers blends them as the screen would. */
const sample = (img: ImageLike, x: number, y: number, at: (img: ImageLike, x: number, y: number) => number) => {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ax = fx - x0;
  const ay = fy - y0;
  const v = (px: number, py: number) => at(img, Math.min(img.width - 1, Math.max(0, px)), Math.min(img.height - 1, Math.max(0, py)));
  return (v(x0, y0) * (1 - ax) + v(x0 + 1, y0) * ax) * (1 - ay) + (v(x0, y0 + 1) * (1 - ax) + v(x0 + 1, y0 + 1) * ax) * ay;
};

/**
 * Round the top-left arc, how much the rim along it (summed across it, from half a pixel outside
 * to two inside) changes from one step to the next, worst case, as a share of its average. Drawn
 * all or nothing, it was 0.13 to 0.22 in these cases; with coverage, 0.07 at most.
 */
function roughness(img: ImageLike, R: number, at: (img: ImageLike, x: number, y: number) => number) {
  const along: number[] = [];
  for (let a = 8; a <= 82; a += 0.5) {
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    let sum = 0;
    for (let d = R - 2; d <= R + 0.5; d += 0.25) sum += sample(img, R - c * d, R - s * d, at);
    along.push(sum);
  }
  const mean = along.reduce((x, y) => x + y, 0) / along.length;
  let worst = 0;
  for (let i = 1; i < along.length; i++) worst = Math.max(worst, Math.abs(along[i] - along[i - 1]));
  return worst / mean;
}

describe('the rim round a corner', () => {
  for (const [radius, dpr] of [[24, 1], [24, 1.25], [60, 1], [18, 2]] as const) {
    it(`is smooth along the arc (radius ${radius}, dpr ${dpr})`, () => {
      const img = lightMap({ width: 300, height: 200, radius, bezelWidth: 46, dpr, curve });
      expect(roughness(img, Math.round(radius * dpr), rimAt)).toBeLessThan(0.1);
    });
  }

  it('is as smooth in the standalone specular map', () => {
    const img = specularMap({ width: 300, height: 200, radius: 24, bezelWidth: 46, dpr: 1.25, angleDeg: 45, strength: 1 });
    // lit by a light at 45°, it's brightest at the middle of the arc: compare neighbours only
    expect(roughness(img, 30, (im, x, y) => im.data[(y * im.width + x) * 4] / 255)).toBeLessThan(0.1);
  });

  it('lights a pixel the edge cuts through as much as the shape covers it', () => {
    expect(edgeCoverage(0.5)).toBe(1);
    expect(edgeCoverage(0)).toBe(0.5);
    expect(edgeCoverage(-0.25)).toBe(0.25);
    expect(edgeCoverage(-0.5)).toBe(0);
    const R = 24;
    const img = lightMap({ width: 300, height: 200, radius: R, bezelWidth: 46, dpr: 1, curve });
    // a pixel whose center is a quarter pixel outside the arc: lit at a quarter
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < R; x++) {
        const t = R - Math.hypot(x + 0.5 - R, y + 0.5 - R);
        if (t > -0.5 && t < 0) expect(Math.abs(rimAt(img, x, y) - edgeCoverage(t))).toBeLessThan(0.02);
        if (t <= -0.5) expect(rimAt(img, x, y)).toBe(0);
      }
    }
  });
});
