import { describe, it, expect } from 'vitest';
import {
  squashSample,
  squashDecay,
  squashDeformation,
  isSquashAtRest,
  DEFAULT_SQUASH,
  SQUASH_REST,
  SQUASH_MAX_DT,
  IDENTITY_DEFORMATION,
} from '../../src/motion/squash';

describe('squash', () => {
  it('rest is the identity', () => {
    expect(squashDeformation(SQUASH_REST)).toEqual(IDENTITY_DEFORMATION);
    expect(isSquashAtRest(SQUASH_REST)).toBe(true);
  });

  it('samples fold in with the smoothing weight; non-finite samples are ignored', () => {
    const s1 = squashSample(SQUASH_REST, 1000, 0);
    expect(s1).toEqual({ vx: 250, vy: 0 });
    const s2 = squashSample(s1, 1000, 400);
    expect(s2.vx).toBeCloseTo(437.5, 9);
    expect(s2.vy).toBeCloseTo(100, 9);
    expect(squashSample(s2, NaN, 0)).toBe(s2);
  });

  it('stretches along the motion axis and squashes across it, capped at maxStretch and maxSkew', () => {
    const right = squashDeformation({ vx: 2000, vy: 0 });
    expect(right.scaleX).toBeCloseTo(1.12, 9);
    expect(right.scaleY).toBeCloseTo(0.94, 9);
    expect(right.skewX).toBeCloseTo(14, 9);
    expect(right.magnitude).toBe(1);
    const fast = squashDeformation({ vx: 1e6, vy: 1e6 });
    expect(fast.scaleX).toBeLessThanOrEqual(1 + DEFAULT_SQUASH.maxStretch);
    expect(fast.scaleY).toBeLessThanOrEqual(1 + DEFAULT_SQUASH.maxStretch);
    expect(Math.abs(fast.skewX)).toBeLessThanOrEqual(DEFAULT_SQUASH.maxSkew);
    expect(fast.magnitude).toBe(1);
    const half = squashDeformation({ vx: 1000, vy: 0 });
    expect(half.scaleX).toBeCloseTo(1.06, 9);
    expect(half.skewX).toBeCloseTo(7, 9);
  });

  it('is symmetric: mirrored velocity mirrors the shear only; swapped axes swap the scales', () => {
    const r = squashDeformation({ vx: 1500, vy: 300 });
    const l = squashDeformation({ vx: -1500, vy: 300 });
    expect(l.scaleX).toBeCloseTo(r.scaleX, 12);
    expect(l.scaleY).toBeCloseTo(r.scaleY, 12);
    expect(l.skewX).toBeCloseTo(-r.skewX, 12);
    const d = squashDeformation({ vx: 300, vy: 1500 });
    expect(d.scaleX).toBeCloseTo(r.scaleY, 12);
    expect(d.scaleY).toBeCloseTo(r.scaleX, 12);
  });

  it('decays exponentially to rest with the frame delta capped', () => {
    let s = { vx: 2000, vy: -500 };
    const oneFrame = squashDecay(s, 1 / 60);
    expect(oneFrame.vx).toBeCloseTo(2000 * Math.exp(-6 / 60), 9);
    expect(squashDecay(s, 5)).toEqual(squashDecay(s, SQUASH_MAX_DT));
    expect(squashDecay(s, -1)).toEqual(s);
    let frames = 0;
    while (!isSquashAtRest(s)) {
      s = squashDecay(s, 1 / 60);
      frames += 1;
    }
    expect(frames).toBeGreaterThan(30);
    expect(frames).toBeLessThan(120); // about 1.2 s at 60 fps
  });

  it('honours a custom config', () => {
    const cfg = { ...DEFAULT_SQUASH, fullSpeed: 500, maxStretch: 0.3, maxSkew: 5 };
    const d = squashDeformation({ vx: 0, vy: -500 }, cfg);
    expect(d.scaleY).toBeCloseTo(1.3, 9);
    expect(d.scaleX).toBeCloseTo(0.85, 9);
    expect(d.skewX).toBe(0);
    expect(squashDeformation({ vx: 5000, vy: 0 }, cfg).skewX).toBe(5);
  });
});
