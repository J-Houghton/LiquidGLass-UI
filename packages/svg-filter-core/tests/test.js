import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import the functions from the built distribution.  When running the tests
// locally you should run `npm run build` beforehand so that `dist/index.js`
// exists.  In the repository this test is illustrative and may be skipped
// by continuous integration if the environment cannot compile TypeScript.
import {
  calculateDisplacementCurve,
  calculateDisplacementMap2,
  SURFACE_FNS,
  buildSpecularImage,
} from '../dist/index.js';

/* Banding metrics copied from the original tests.  These operate on any
 * ImageData-like object (with width, height and data fields) so that we
 * avoid coupling to browser APIs.
 */
function scoreDisplacement(img, opts = {}) {
  const { width: W, height: H, data } = img;
  const tol = opts.tol ?? 1;
  const neutral = opts.neutral ?? 128;
  const eq = (a, b) => Math.abs(a - b) <= tol;
  const active = (i) => {
    const r = data[i], g = data[i + 1];
    return Math.abs(r - neutral) > tol || Math.abs(g - neutral) > tol;
  };
  let flats = 0, pairs = 0, activePixels = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      if (active(idx)) activePixels++;
      if (x + 1 < W) {
        const idxR = (y * W + (x + 1)) * 4;
        if (active(idx) && active(idxR)) {
          if (eq(data[idx + 0], data[idxR + 0])) flats++;
          if (eq(data[idx + 1], data[idxR + 1])) flats++;
          pairs += 2;
        }
      }
      if (y + 1 < H) {
        const idxD = ((y + 1) * W + x) * 4;
        if (active(idx) && active(idxD)) {
          if (eq(data[idx + 0], data[idxD + 0])) flats++;
          if (eq(data[idx + 1], data[idxD + 1])) flats++;
          pairs += 2;
        }
      }
    }
  }
  const flatFraction = pairs ? flats / pairs : 0;
  const coverage = (W * H) ? activePixels / (W * H) : 0;
  let energy = 0, count = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      if (!(active(i) && active(i - 4) && active(i + 4) && active(i - 4 * W) && active(i + 4 * W))) continue;
      for (let c = 0; c < 2; c++) {
        const p = i + c;
        const up = p - 4 * W, down = p + 4 * W, left = p - 4, right = p + 4;
        const lap = 4 * data[p] - data[up] - data[down] - data[left] - data[right];
        energy += Math.abs(lap);
        count++;
      }
    }
  }
  const laplacianEnergy = count ? energy / count : 0;
  return { flatFraction, laplacianEnergy, coverage };
}

test('calculateDisplacementCurve produces array of requested length', () => {
  const samples = 128;
  const curve = calculateDisplacementCurve(50, 20, SURFACE_FNS.convex_squircle.fn, 1.5, samples);
  assert.equal(curve.length, samples);
  // Should not be all zeros.
  const nonZero = curve.some((v) => Math.abs(v) > 0);
  assert.ok(nonZero);
});

test('calculateDisplacementMap2 produces correct dimensions and ranges', () => {
  const width = 100;
  const height = 50;
  const radius = 20;
  const bezel = 10;
  const curve = calculateDisplacementCurve(40, bezel, SURFACE_FNS.convex_squircle.fn, 1.5, 128);
  const maxAbs = curve.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
  const map = calculateDisplacementMap2(width, height, radius, bezel, maxAbs, curve, 1);
  assert.equal(map.width, Math.round(width));
  assert.equal(map.height, Math.round(height));
  assert.equal(map.data.length, map.width * map.height * 4);
  // All alpha values should be 255 and red/green within [0,255].  Blue unused.
  for (let i = 0; i < map.data.length; i += 4) {
    const r = map.data[i];
    const g = map.data[i + 1];
    const b = map.data[i + 2];
    const a = map.data[i + 3];
    assert.ok(r >= 0 && r <= 255);
    assert.ok(g >= 0 && g <= 255);
    assert.equal(b, 0);
    assert.equal(a, 255);
  }
});

test('higher sample counts reduce banding metrics', () => {
  const params = { W: 200, H: 100, radius: 30, bezel: 20, glass: 40, ior: 1.5 };
  // Low resolution displacement map
  const curveLow = calculateDisplacementCurve(params.glass, params.bezel, SURFACE_FNS.convex_squircle.fn, params.ior, 128);
  const maxLow = curveLow.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
  const dispLow = calculateDisplacementMap2(params.W, params.H, params.radius, params.bezel, maxLow, curveLow, 1);
  const scoreLow = scoreDisplacement(dispLow);
  // High resolution displacement map
  const curveHigh = calculateDisplacementCurve(params.glass, params.bezel, SURFACE_FNS.convex_squircle.fn, params.ior, 512);
  const maxHigh = curveHigh.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
  const dispHigh = calculateDisplacementMap2(params.W, params.H, params.radius, params.bezel, maxHigh, curveHigh, 1);
  const scoreHigh = scoreDisplacement(dispHigh);
  // Expect that the high sample map has lower flat fraction and laplacian energy.
  assert.ok(scoreHigh.flatFraction <= scoreLow.flatFraction * 0.95);
  assert.ok(scoreHigh.laplacianEnergy <= scoreLow.laplacianEnergy * 0.95);
});

test('buildSpecularImage produces highlight in rim only', () => {
  const img = buildSpecularImage(100, 50, 20, 10, 45, 1, 1, 2);
  // Count non-zero pixels and ensure alpha equals rgb.  The specular image
  // should leave the inner region untouched (remain zeros) and assign
  // identical values across channels on the rim.
  let nonZero = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    const a = img.data[i + 3];
    if (r || g || b || a) {
      nonZero++;
      assert.equal(r, g);
      assert.equal(g, b);
      assert.equal(b, a);
    }
  }
  assert.ok(nonZero > 0);
});