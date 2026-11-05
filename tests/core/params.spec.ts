import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GLASS_PARAMS,
  GLASS_PARAM_KEYS,
  resolveGlassParams,
  fromLegacyParams,
} from '../../src/core/params';
import { DEFAULT_GLASS_CONTAINER_PARAMS } from '../../src/core/defaults';

describe('resolveGlassParams', () => {
  it('defaults resolve cleanly: no notes, rectangle', () => {
    const r = resolveGlassParams();
    expect(r.notes).toEqual([]);
    expect(r.shape).toBe('rect');
    for (const k of GLASS_PARAM_KEYS) expect(r[k]).toEqual(DEFAULT_GLASS_PARAMS[k]);
  });

  it('merges a partial over the base and ignores undefined', () => {
    const r = resolveGlassParams({ blur: 1.5, tint: undefined });
    expect(r.blur).toBe(1.5);
    expect(r.tint).toBe(DEFAULT_GLASS_PARAMS.tint);
    const r2 = resolveGlassParams({ dispersion: 2 }, r);
    expect(r2.blur).toBe(1.5);
    expect(r2.dispersion).toBe(2);
  });

  it('throws on an unknown surface or blurKind', () => {
    expect(() => resolveGlassParams({ surface: 'dome' as never })).toThrow(/unknown surface/);
    expect(() => resolveGlassParams({ blurKind: 'box' as never })).toThrow(/unknown blurKind/);
  });

  it('clamps geometry to the shape and records notes', () => {
    const r = resolveGlassParams({ width: 300, height: 120, radius: 100, bezelWidth: 0 });
    expect(r.radius).toBe(60);
    expect(r.bezelWidth).toBe(1);
    expect(r.notes.some((n) => n.startsWith('radius: 100 → 60'))).toBe(true);
    expect(r.notes.some((n) => n.startsWith('bezelWidth: 0 → 1'))).toBe(true);
  });

  it('allows a bezel wider than the corner radius (1.x forbade it)', () => {
    const r = resolveGlassParams({ width: 300, height: 120, radius: 20, bezelWidth: 50 });
    expect(r.bezelWidth).toBe(50);
    expect(r.notes).toEqual([]);
  });

  it('clamps optics and look values', () => {
    const r = resolveGlassParams({
      refractiveIndex: 0.5,
      chromaticBezelFraction: 0,
      tint: 2,
      saturation: -1,
      displacementScale: -5,
      blur: -1,
      specularStrength: -0.5,
    });
    expect(r.refractiveIndex).toBe(1);
    expect(r.chromaticBezelFraction).toBe(0.001);
    expect(r.tint).toBe(1);
    expect(r.saturation).toBe(0);
    expect(r.displacementScale).toBe(0);
    expect(r.blur).toBe(0);
    expect(r.specularStrength).toBe(0);
    expect(r.notes).toHaveLength(7);
  });

  it('replaces non-finite numbers with the base value', () => {
    const r = resolveGlassParams({ width: Number.NaN, radius: Infinity as number });
    expect(r.width).toBe(DEFAULT_GLASS_PARAMS.width);
    expect(r.radius).toBe(DEFAULT_GLASS_PARAMS.radius);
    expect(r.notes.filter((n) => n.includes('not a finite number'))).toHaveLength(2);
  });

  it('coerces specular to boolean', () => {
    expect(resolveGlassParams({ specular: 0 as unknown as boolean }).specular).toBe(false);
    expect(resolveGlassParams({ specular: 'yes' as unknown as boolean }).specular).toBe(true);
  });

  it('classifies a square with full radius as a circle, otherwise rect', () => {
    expect(resolveGlassParams({ width: 200, height: 200, radius: 100 }).shape).toBe('circle');
    expect(resolveGlassParams({ width: 200, height: 200, radius: 10 }).shape).toBe('rect');
    expect(resolveGlassParams({ width: 300, height: 120, radius: 60 }).shape).toBe('rect');
  });

  it('does not mutate its inputs', () => {
    const input = { radius: 500 };
    const base = { ...DEFAULT_GLASS_PARAMS };
    resolveGlassParams(input, base);
    expect(input).toEqual({ radius: 500 });
    expect(base).toEqual(DEFAULT_GLASS_PARAMS);
  });
});

describe('fromLegacyParams', () => {
  it('renames 1.x keys and converts factor to fraction', () => {
    const out = fromLegacyParams({
      scalePx: 180,
      blurStdDev: 0.33,
      showSpecular: false,
      frost: 0.1,
      chromaticBezelFactor: 4,
      saturation: 1.2,
    });
    expect(out).toEqual({
      displacementScale: 180,
      blur: 0.33,
      specular: false,
      tint: 0.1,
      chromaticBezelFraction: 0.25,
      saturation: 1.2,
    });
  });

  it('applies the 1.x thickness curve by default and passes through when disabled', () => {
    expect(fromLegacyParams({ glassThickness: 50 }).glassThickness).toBe(31.25);
    expect(fromLegacyParams({ glassThickness: 50 }, { thicknessCurve: false }).glassThickness).toBe(50);
    expect(fromLegacyParams({})).toEqual({});
  });

  it('the 1.x container defaults map exactly onto DEFAULT_GLASS_PARAMS', () => {
    const resolved = resolveGlassParams(fromLegacyParams(DEFAULT_GLASS_CONTAINER_PARAMS));
    expect(resolved.notes).toEqual([]);
    for (const k of GLASS_PARAM_KEYS) expect(resolved[k]).toEqual(DEFAULT_GLASS_PARAMS[k]);
  });
});
