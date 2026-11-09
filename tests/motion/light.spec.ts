import { describe, it, expect } from 'vitest';
import { lightAngleFor, distanceToRect, pointerWeight, mixPoints, lightAngleDelta, approachLightAngle } from '../../src/motion/light';

const rect = { left: 100, top: 100, width: 200, height: 100 }; // centre (200, 150)

describe('light placement', () => {
  it('lightAngleFor: degrees from the rect centre to the light, y down', () => {
    expect(lightAngleFor(rect, { x: 500, y: 150 })).toBeCloseTo(0, 9);
    expect(lightAngleFor(rect, { x: 200, y: -100 })).toBeCloseTo(-90, 9);
    expect(lightAngleFor(rect, { x: 200, y: 400 })).toBeCloseTo(90, 9);
    expect(lightAngleFor(rect, { x: 300, y: 250 })).toBeCloseTo(45, 9);
    expect(lightAngleFor(rect, { x: -100, y: 150 })).toBeCloseTo(180, 9);
  });

  it('distanceToRect: 0 inside, edge distance beside, corner distance diagonally', () => {
    expect(distanceToRect({ x: 150, y: 120 }, rect)).toBe(0);
    expect(distanceToRect({ x: 350, y: 150 }, rect)).toBe(50);
    expect(distanceToRect({ x: 150, y: 20 }, rect)).toBe(80);
    expect(distanceToRect({ x: 330, y: 240 }, rect)).toBeCloseTo(50, 9); // 30 right, 40 below
  });

  it('pointerWeight: 1 on the rect, 0 at the radius, smoothstep between, monotone', () => {
    expect(pointerWeight(0, 160)).toBe(1);
    expect(pointerWeight(160, 160)).toBe(0);
    expect(pointerWeight(1000, 160)).toBe(0);
    expect(pointerWeight(80, 160)).toBeCloseTo(0.5, 9);
    let last = 1;
    for (let d = 0; d <= 160; d += 8) {
      const w = pointerWeight(d, 160);
      expect(w).toBeLessThanOrEqual(last + 1e-12);
      last = w;
    }
    expect(pointerWeight(0, 0)).toBe(1);
    expect(pointerWeight(1, 0)).toBe(0);
  });

  it('mixPoints interpolates', () => {
    expect(mixPoints({ x: 0, y: 0 }, { x: 10, y: -20 }, 0.25)).toEqual({ x: 2.5, y: -5 });
  });

  it('lightAngleDelta: shortest step on the 180° circle', () => {
    expect(lightAngleDelta(0, 30)).toBe(30);
    expect(lightAngleDelta(0, 180)).toBe(0); // opposite direction, same rim light
    expect(lightAngleDelta(170, -10)).toBe(0);
    expect(lightAngleDelta(80, -80)).toBe(20);
    expect(lightAngleDelta(-80, 80)).toBe(-20);
    expect(lightAngleDelta(0, 90)).toBe(90);
    expect(lightAngleDelta(0, -90)).toBe(90); // the tie goes the positive way
    expect(lightAngleDelta(10, 95)).toBe(85);
    expect(lightAngleDelta(10, 105)).toBe(-85);
  });

  it('approachLightAngle eases the short way and clamps the fraction', () => {
    expect(approachLightAngle(0, 40, 0.5)).toBe(20);
    expect(approachLightAngle(170, -10, 0.5)).toBe(170); // already the same light
    expect(approachLightAngle(80, -80, 0.5)).toBe(90); // goes up through 90, not down through 0
    expect(approachLightAngle(0, 40, 2)).toBe(40);
    expect(approachLightAngle(0, 40, -1)).toBe(0);
  });
});
