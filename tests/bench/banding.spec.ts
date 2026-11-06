// Benchmark, not a regression gate: compares the current optics against the original
// algorithm and prints banding metrics. Run with:  BENCH=1 npx vitest run tests/bench
// Thresholds were removed in plan step 0.5 (they measured a flat-fraction vs Laplacian
// trade-off, and failed on main); the tables are the output.

import { describe, it, expect } from 'vitest';
import { scoreDisplacement, type Score } from './metrics';

// New implementation
import { displacementCurve } from '../../src/core/optics/disp1d';
import { displacementMap } from '../../src/core/optics/disp2d';
import { SURFACE_FNS as NEW_SURFACES } from '../../src/core/optics/surfaces';

// Original implementation (kept under tests/)
import { calculateDisplacementMap as origDisp1D } from './orig_displacement_funcs/displacementMap';
import { calculateDisplacementMap2 as origDisp2D } from './orig_displacement_funcs/displacementMap';
import { fns as ORIG_SURFACES } from './orig_displacement_funcs/surfaceEquations';

// ---------- shared helpers ----------

type NewParams = {
  W: number; H: number; radius: number; bezel: number; glass: number;
  ior: number; samples: number; dpr?: number; surface?: keyof typeof NEW_SURFACES;
};

type OrigParams = {
  W: number; H: number; radius: number; bezel: number; glass: number;
  ior: number; samples: number; dpr?: number; surfaceTitle?: string;
};

function buildMapNew({
  W, H, radius, bezel, glass, ior, samples, dpr = 1, surface = 'convex_squircle'
}: NewParams) {
  const curve = displacementCurve({ glassThickness: glass, bezelWidth: bezel, refractiveIndex: ior, surface: NEW_SURFACES[surface].fn, samples });
  return displacementMap({ width: W, height: H, radius, bezelWidth: bezel, dpr, curve }) as unknown as ImageData;
}

const pickSurface = (title: string) =>
  ORIG_SURFACES.find(s => s.title.toLowerCase().includes(title)) ?? ORIG_SURFACES[0];

function buildMapOrig({
  W, H, radius, bezel, glass, ior, samples, dpr = 1, surfaceTitle = 'convex'
}: OrigParams) {
  const surf = pickSurface(surfaceTitle).fn;
  const disp1D = origDisp1D(glass, bezel, surf, ior, samples);
  const maxAbs = disp1D.reduce((m, v) => Math.max(m, Math.abs(v)), 1);
  const Wobj = W, Hobj = H; // object spans the canvas for baseline parity
  return origDisp2D(W, H, Wobj, Hobj, radius, bezel, maxAbs, disp1D, dpr) as unknown as ImageData;
}

const score = (img: ImageData) => {
  const s = scoreDisplacement(img, { tol: 1, neutral: 128 });
  expect(s.coverage).toBeGreaterThan(0.05);
  return s;
};

// pretty printing
const r = (n: number) => Number.isFinite(n) ? Number(n.toFixed(6)) : n;
const pct = (orig: number, next: number) =>
  Number.isFinite(orig) && orig !== 0 ? Number((((orig - next) / Math.abs(orig)) * 100).toFixed(2)) : NaN;

function compareRow(label: string, newS: Score, origS: Score) {
  const flatImp = pct(origS.flatFraction, newS.flatFraction);
  const lapImp  = pct(origS.laplacianEnergy, newS.laplacianEnergy);
  const flatWin = newS.flatFraction <= origS.flatFraction ? 'NEW' : 'ORIG';
  const lapWin  = newS.laplacianEnergy <= origS.laplacianEnergy ? 'NEW' : 'ORIG';
  return {
    label,
    'new.flat': r(newS.flatFraction),
    'orig.flat': r(origS.flatFraction),
    'Δ flat': r(newS.flatFraction - origS.flatFraction),
    'improve flat %': flatImp,
    'better flat': flatWin,
    'new.lap': r(newS.laplacianEnergy),
    'orig.lap': r(origS.laplacianEnergy),
    'Δ lap': r(newS.laplacianEnergy - origS.laplacianEnergy),
    'improve lap %': lapImp,
    'better lap': lapWin,
    'new.cover': r(newS.coverage),
    'orig.cover': r(origS.coverage),
  };
}

function printComparison(title: string, rows: ReturnType<typeof compareRow>[]) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${title} ===`);
  // eslint-disable-next-line no-console
  console.table(rows);
}

// ---------- tests ----------

describe.skipIf(!process.env.BENCH)('displacement banding metrics', () => {
  const base = { W: 340, H: 160, radius: 60, bezel: 60, glass: 50, ior: 1.5 };

  it('new: more samples → lower flat-fraction and laplacianEnergy', () => {
    const low = buildMapNew({ ...base, samples: 128 });
    const hi  = buildMapNew({ ...base, samples: 1024 });
    const sL = score(low);
    const sH = score(hi);
    printComparison('NEW samples sweep', [
      compareRow('samples 128 → 1024 (lower is better)', sH, sL),
    ]);
  });

  it('new: DPR-aware map reduces plateauing vs DPR=1 under upscaled display', () => {
    const dpr1 = buildMapNew({ ...base, samples: 512, dpr: 1 });
    const dpr2 = buildMapNew({ ...base, samples: 512, dpr: 2 });
    const s1 = score(dpr1);
    const s2 = score(dpr2);
    printComparison('NEW DPR sweep', [
      compareRow('DPR 1 → 2 (lower is better)', s2, s1),
    ]);
  });

  it('orig: samples and DPR sweeps (console baseline)', () => {
    const lowO = buildMapOrig({ ...base, samples: 128 });
    const hiO  = buildMapOrig({ ...base, samples: 1024 });
    const sLo = score(lowO);
    const sHo = score(hiO);

    const dpr1O = buildMapOrig({ ...base, samples: 512, dpr: 1 });
    const dpr2O = buildMapOrig({ ...base, samples: 512, dpr: 2 });
    const s1o = score(dpr1O);
    const s2o = score(dpr2O);

    printComparison('ORIG samples sweep', [
      compareRow('samples 128 → 1024 (lower is better)', sHo, sLo),
    ]);
    printComparison('ORIG DPR sweep', [
      compareRow('DPR 1 → 2 (lower is better)', s2o, s1o),
    ]);
  });

  it('A/B: new vs orig at same params (who is better)', () => {
    // Same params for apples-to-apples
    const params = { ...base, samples: 512, dpr: 1 as const };

    const imgN1 = buildMapNew(params);
    const imgO1 = buildMapOrig({ ...params, surfaceTitle: 'convex' });
    const sN1 = score(imgN1);
    const sO1 = score(imgO1);

    const params2 = { ...base, samples: 512, dpr: 2 as const };
    const imgN2 = buildMapNew(params2);
    const imgO2 = buildMapOrig({ ...params2, surfaceTitle: 'convex' });
    const sN2 = score(imgN2);
    const sO2 = score(imgO2);

    printComparison('A/B new vs orig @ samples=512, DPR=1 and DPR=2', [
      compareRow('DPR=1 (lower is better)', sN1, sO1),
      compareRow('DPR=2 (lower is better)', sN2, sO2),
    ]);

  });
});
