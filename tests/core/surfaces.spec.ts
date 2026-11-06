import { describe, it, expect } from 'vitest';
import { SURFACE_FNS, CONVEX, CONVEX_CIRCLE, CONCAVE, LIP, asSurfaceKind, type SurfaceKind } from '../../src/core/optics/surfaces';
import { expectToMatchFixture } from '../helpers/fixtures';

const XS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const KINDS = Object.keys(SURFACE_FNS) as SurfaceKind[];

describe('surfaces', () => {
  it('registry has the four kinds with titles', () => {
    expect(KINDS).toEqual(['convex_circle', 'convex_squircle', 'concave', 'lip']);
    for (const k of KINDS) expect(SURFACE_FNS[k].title.length).toBeGreaterThan(0);
  });

  for (const kind of KINDS) {
    it(`${kind}: profile values are pinned`, () => {
      expectToMatchFixture(`surfaces/${kind}`, XS.map((x) => SURFACE_FNS[kind].fn(x)), 1e-12);
    });
  }

  it('convex profiles go from 0 at the rim to 1 at the inner edge, monotonically', () => {
    for (const s of [CONVEX, CONVEX_CIRCLE]) {
      expect(s.fn(0)).toBeCloseTo(0, 12);
      expect(s.fn(1)).toBeCloseTo(1, 12);
      for (let i = 1; i < XS.length; i++) expect(s.fn(XS[i])).toBeGreaterThanOrEqual(s.fn(XS[i - 1]));
    }
  });

  it('concave is the complement of the circle', () => {
    for (const x of XS) expect(CONCAVE.fn(x)).toBeCloseTo(1 - CONVEX_CIRCLE.fn(x), 12);
  });

  it('lip is finite on [0,1] and clamps its doubled argument', () => {
    for (const x of XS) expect(Number.isFinite(LIP.fn(x))).toBe(true);
    expect(LIP.fn(1)).toBeCloseTo(CONCAVE.fn(1) + 0.1, 12);
  });

  it('asSurfaceKind passes valid kinds and falls back to convex_squircle', () => {
    for (const k of KINDS) expect(asSurfaceKind(k)).toBe(k);
    expect(asSurfaceKind('nope')).toBe('convex_squircle');
    expect(asSurfaceKind('')).toBe('convex_squircle');
  });
});
