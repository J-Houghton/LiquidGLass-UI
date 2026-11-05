import { describe, it, expect } from 'vitest';
import { calculateDisplacementMap } from '../../src/core/optics/disp1d';
import { SURFACE_FNS, type SurfaceKind } from '../../src/core/optics/surfaces';
import { expectToMatchFixture } from '../helpers/fixtures';

const KINDS = Object.keys(SURFACE_FNS) as SurfaceKind[];
const IORS = [1.0, 1.5, 2.2];
const GEOMS = [
  { glass: 31.25, bezel: 60 }, // the default container after the thickness smoothstep
  { glass: 100, bezel: 30 },
];
const SAMPLES = 64;

describe('disp1d: 1D refraction displacement curve', () => {
  for (const kind of KINDS) {
    it(`${kind}: curves are pinned for IOR x geometry`, () => {
      const record: Record<string, number[]> = {};
      for (const ior of IORS) {
        for (const g of GEOMS) {
          record[`ior${ior}-g${g.glass}-b${g.bezel}`] = calculateDisplacementMap(
            g.glass,
            g.bezel,
            SURFACE_FNS[kind].fn,
            ior,
            SAMPLES,
          );
        }
      }
      expectToMatchFixture(`disp1d/${kind}`, record, 1e-9);
    });
  }

  it('returns exactly `samples` finite values', () => {
    for (const kind of KINDS) {
      const out = calculateDisplacementMap(31.25, 60, SURFACE_FNS[kind].fn, 1.5, 37);
      expect(out).toHaveLength(37);
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('IOR 1.0 (no refraction) yields zero displacement everywhere (up to float residue)', () => {
    for (const kind of KINDS) {
      const out = calculateDisplacementMap(50, 60, SURFACE_FNS[kind].fn, 1.0, 32);
      for (const v of out) expect(Math.abs(v)).toBeLessThan(1e-9);
    }
  });

  it('soft knee keeps |displacement| below glassThickness + bezelWidth', () => {
    for (const kind of KINDS) {
      const knee = 31.25 + 60;
      const out = calculateDisplacementMap(31.25, 60, SURFACE_FNS[kind].fn, 2.2, 256);
      for (const v of out) expect(Math.abs(v)).toBeLessThan(knee);
    }
  });

  it('on a convex squircle the flat inner edge displaces less than the steep rim', () => {
    const out = calculateDisplacementMap(31.25, 60, SURFACE_FNS.convex_squircle.fn, 1.5, 256);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(Math.abs(out[1]));
  });
});
