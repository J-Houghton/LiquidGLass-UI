import { describe, it, expect } from 'vitest';
import { displacementCurve } from '../../src/core/optics/disp1d';
import { SURFACE_FNS, type SurfaceKind } from '../../src/core/optics/surfaces';
import { expectToMatchFixture } from '../helpers/fixtures';

const KINDS = Object.keys(SURFACE_FNS) as SurfaceKind[];
const IORS = [1.0, 1.5, 2.2];
const GEOMS = [
  { glass: 31.25, bezel: 60 }, // the default container (the 1.x value 50 after its smoothstep)
  { glass: 100, bezel: 30 },
];
const SAMPLES = 64;

const curve = (glass: number, bezel: number, surface: SurfaceKind, ior: number, samples: number) =>
  Array.from(displacementCurve({ glassThickness: glass, bezelWidth: bezel, refractiveIndex: ior, surface, samples }));

describe('displacementCurve: 1D refraction displacement', () => {
  for (const kind of KINDS) {
    it(`${kind}: curves are pinned for IOR x geometry`, () => {
      const record: Record<string, number[]> = {};
      for (const ior of IORS) {
        for (const g of GEOMS) {
          record[`ior${ior}-g${g.glass}-b${g.bezel}`] = curve(g.glass, g.bezel, kind, ior, SAMPLES);
        }
      }
      expectToMatchFixture(`disp1d/${kind}`, record, 1e-9);
    });
  }

  it('returns exactly `samples` finite values (default 512) and accepts a surface function', () => {
    for (const kind of KINDS) {
      const out = displacementCurve({ glassThickness: 31.25, bezelWidth: 60, refractiveIndex: 1.5, surface: kind, samples: 37 });
      expect(out).toBeInstanceOf(Float64Array);
      expect(out).toHaveLength(37);
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
    }
    expect(displacementCurve({ glassThickness: 10, bezelWidth: 10, refractiveIndex: 1.5, surface: 'lip' })).toHaveLength(512);
    const byFn = displacementCurve({ glassThickness: 10, bezelWidth: 10, refractiveIndex: 1.5, surface: SURFACE_FNS.lip.fn, samples: 8 });
    const byName = displacementCurve({ glassThickness: 10, bezelWidth: 10, refractiveIndex: 1.5, surface: 'lip', samples: 8 });
    expect(Array.from(byFn)).toEqual(Array.from(byName));
  });

  it('IOR 1.0 (no refraction) yields zero displacement everywhere (up to float residue)', () => {
    for (const kind of KINDS) {
      for (const v of curve(50, 60, kind, 1.0, 32)) expect(Math.abs(v)).toBeLessThan(1e-9);
    }
  });

  it('soft knee keeps |displacement| below glassThickness + bezelWidth', () => {
    for (const kind of KINDS) {
      const knee = 31.25 + 60;
      for (const v of curve(31.25, 60, kind, 2.2, 256)) expect(Math.abs(v)).toBeLessThan(knee);
    }
  });

  it('on a convex squircle the flat inner edge displaces less than the steep rim', () => {
    const out = curve(31.25, 60, 'convex_squircle', 1.5, 256);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(Math.abs(out[1]));
  });
});
