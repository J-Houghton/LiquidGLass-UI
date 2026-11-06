import { describe, it, expect } from 'vitest';
import { validate, mapGlassThickness, type InputState } from '../../src/core/validation/geometry';

const base: InputState = {
  width: 300,
  height: 120,
  radius: 60,
  bezelWidth: 60,
  glassThickness: 50,
  surface: 'convex_squircle',
};

describe('geometry.validate', () => {
  it('default container: rectangle, nothing clamped, thickness smoothed 50 -> 31.25', () => {
    const v = validate(base);
    expect(v.kind).toBe('rect');
    expect(v.width).toBe(300);
    expect(v.height).toBe(120);
    expect(v.radius).toBe(60);
    expect(v.bezelWidth).toBe(60);
    expect(v.surface).toBe('convex_squircle');
    expect(v.glassThickness_eff).toBe(31.25);
    expect(v.notes).toHaveLength(1);
    expect(v.notes[0]).toMatch(/^glassThickness smoothed \(50→31\.3\)$/);
  });

  it('radius clamps to half the short side and to at least 1', () => {
    expect(validate({ ...base, radius: 100 }).radius).toBe(60);
    expect(validate({ ...base, radius: 100 }).notes).toContain('radius→60 (max 60)');
    expect(validate({ ...base, radius: 0 }).radius).toBe(1);
    expect(validate({ ...base, radius: -5 }).radius).toBe(1);
  });

  it('bezel clamps to the radius, to half the short side, and to at least 1', () => {
    const v = validate({ ...base, radius: 40, bezelWidth: 80 });
    expect(v.bezelWidth).toBe(40);
    expect(v.notes).toContain('bezelWidth→40 (max 40)');
    expect(validate({ ...base, bezelWidth: 0 }).bezelWidth).toBe(1);
    expect(validate({ ...base, width: 100, height: 100, radius: 50, bezelWidth: 60 }).bezelWidth).toBe(50);
  });

  it('a square is classified as a circle regardless of radius', () => {
    expect(validate({ ...base, width: 200, height: 200 }).kind).toBe('circle');
    expect(validate({ ...base, width: 200, height: 200, radius: 10 }).kind).toBe('circle');
  });

  it('the circle-only surface is coerced to squircle on rectangles only', () => {
    const rect = validate({ ...base, surface: 'convex_circle' });
    expect(rect.surface).toBe('convex_squircle');
    expect(rect.notes).toContain('surface→convex_squircle (circle-only disabled for rectangles)');
    const square = validate({ ...base, width: 200, height: 200, radius: 100, bezelWidth: 100, surface: 'convex_circle' });
    expect(square.surface).toBe('convex_circle');
    const custom = validate({ ...base, surface: 'lip' }, { circleOnlySurface: 'lip' });
    expect(custom.surface).toBe('convex_squircle');
  });

  it('emits no notes when nothing is adjusted', () => {
    const v = validate({ width: 200, height: 200, radius: 50, bezelWidth: 30, glassThickness: 200, surface: 'concave' });
    expect(v.notes).toEqual([]);
    expect(v.glassThickness_eff).toBe(200);
  });

  it('honours thicknessMaxUI', () => {
    expect(validate({ ...base, glassThickness: 50 }, { thicknessMaxUI: 100 }).glassThickness_eff).toBe(50);
  });
});

describe('geometry.mapGlassThickness', () => {
  it('smoothsteps 0..max onto 0..max with a soft start', () => {
    expect(mapGlassThickness(0)).toBe(0);
    expect(mapGlassThickness(50)).toBe(31.25);
    expect(mapGlassThickness(100)).toBe(100);
    expect(mapGlassThickness(200)).toBe(200);
    expect(mapGlassThickness(300)).toBe(200); // clamped
    expect(mapGlassThickness(50, 100)).toBe(50);
    expect(mapGlassThickness(25, 100)).toBe(15.625);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let t = 0; t <= 200; t += 5) {
      const v = mapGlassThickness(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
