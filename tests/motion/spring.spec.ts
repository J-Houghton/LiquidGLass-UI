import { describe, it, expect } from 'vitest';
import {
  springPhysics,
  springPerceptual,
  stepSpring,
  isSpringAtRest,
  springLinearEasing,
  DEFAULT_SPRING,
  type SpringPhysics,
  type SpringState,
} from '../../src/motion/spring';

/** Step from 0 toward 1 in `n` equal slices of `total` seconds. */
function run(physics: SpringPhysics, total: number, n: number, start: SpringState = { value: 0, velocity: 0 }, target = 1): SpringState[] {
  const out: SpringState[] = [];
  let s = start;
  for (let i = 0; i < n; i++) {
    s = stepSpring(s, target, total / n, physics);
    out.push(s);
  }
  return out;
}

describe('springPhysics', () => {
  it("reproduces Apple's documented (duration, bounce) ⇔ (stiffness, damping) pairs", () => {
    const a = springPhysics({ duration: 0.5, bounce: 0.3 });
    expect(a.mass).toBe(1);
    expect(a.stiffness).toBeCloseTo(157.9, 1);
    expect(a.damping).toBeCloseTo(17.6, 1);
    const p = springPerceptual({ mass: 1, stiffness: 100, damping: 10 });
    expect(p.duration).toBeCloseTo(0.63, 2);
    expect(p.bounce).toBeCloseTo(0.5, 6);
    expect(DEFAULT_SPRING).toEqual(springPhysics({ duration: 0.5, bounce: 0.3 }));
  });

  it('round-trips through the perceptual view, including negative bounce (overdamped)', () => {
    for (const cfg of [
      { duration: 0.3, bounce: 0 },
      { duration: 0.8, bounce: 0.6 },
      { duration: 0.4, bounce: -0.5 },
    ]) {
      const back = springPerceptual(springPhysics(cfg));
      expect(back.duration).toBeCloseTo(cfg.duration, 9);
      expect(back.bounce).toBeCloseTo(cfg.bounce, 9);
    }
  });

  it('fills physical defaults and clamps a silly bounce', () => {
    expect(springPhysics({ stiffness: 300 })).toEqual({ mass: 1, stiffness: 300, damping: DEFAULT_SPRING.damping });
    expect(springPhysics({ duration: 0.5, bounce: 1 }).damping).toBeGreaterThan(0);
    expect(Number.isFinite(springPhysics({ duration: 0.5, bounce: -1 }).damping)).toBe(true);
  });
});

describe('stepSpring', () => {
  const under = springPhysics({ duration: 0.5, bounce: 0.3 });
  const critical = springPhysics({ duration: 0.5, bounce: 0 });
  const over = springPhysics({ duration: 0.5, bounce: -0.5 });

  it('is exact: one step equals the same time in many steps, in all three damping regimes', () => {
    for (const physics of [under, critical, over]) {
      const start = { value: 0.2, velocity: -3 };
      const once = stepSpring(start, 1, 0.37, physics);
      const many = run(physics, 0.37, 37, start).at(-1)!;
      expect(many.value).toBeCloseTo(once.value, 9);
      expect(many.velocity).toBeCloseTo(once.velocity, 9);
    }
  });

  it('starts with the given velocity (derivative at t = 0)', () => {
    for (const physics of [under, critical, over]) {
      const s = stepSpring({ value: 0, velocity: 2 }, 1, 1e-6, physics);
      expect((s.value - 0) / 1e-6).toBeCloseTo(2, 3);
    }
  });

  it('underdamped overshoots and settles; critical and overdamped approach monotonically', () => {
    const u = run(under, 2, 400).map((s) => s.value);
    // first overshoot of a step response: exp(−πζ/√(1−ζ²)) = 4.6 % at ζ = 0.7 (bounce 0.3)
    expect(Math.max(...u)).toBeCloseTo(1 + Math.exp((-Math.PI * 0.7) / Math.sqrt(1 - 0.49)), 3);
    expect(u.at(-1)!).toBeCloseTo(1, 4);
    for (const physics of [critical, over]) {
      const vals = run(physics, 4, 800).map((s) => s.value); // the overdamped one settles slowly
      for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1] - 1e-12);
      expect(Math.max(...vals)).toBeLessThanOrEqual(1 + 1e-9);
      expect(vals.at(-1)!).toBeCloseTo(1, 3);
    }
  });

  it('critical damping is the boundary of the two other branches', () => {
    const nearUnder = springPhysics({ duration: 0.5, bounce: 1e-4 });
    const nearOver = springPhysics({ duration: 0.5, bounce: -1e-4 });
    for (const t of [0.05, 0.2, 0.6]) {
      const c = stepSpring({ value: 0, velocity: 0 }, 1, t, critical);
      expect(stepSpring({ value: 0, velocity: 0 }, 1, t, nearUnder).value).toBeCloseTo(c.value, 4);
      expect(stepSpring({ value: 0, velocity: 0 }, 1, t, nearOver).value).toBeCloseTo(c.value, 4);
    }
  });

  it('retargeting mid-flight keeps value and velocity continuous', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 10; i++) s = stepSpring(s, 1, 0.016, under);
    const before = { ...s };
    const next = stepSpring(s, 0.25, 1e-5, under); // new target, tiny step
    expect(next.value).toBeCloseTo(before.value + before.velocity * 1e-5, 6);
    expect(next.velocity).toBeCloseTo(before.velocity, 2);
  });

  it('a non-positive dt returns the state unchanged', () => {
    const s = { value: 0.4, velocity: 1 };
    expect(stepSpring(s, 1, 0, under)).toBe(s);
    expect(stepSpring(s, 1, -1, under)).toBe(s);
    expect(stepSpring(s, 1, NaN, under)).toBe(s);
  });

  it('isSpringAtRest uses both thresholds', () => {
    expect(isSpringAtRest({ value: 1.0005, velocity: 0.001 }, 1)).toBe(true);
    expect(isSpringAtRest({ value: 1.0005, velocity: 0.5 }, 1)).toBe(false);
    expect(isSpringAtRest({ value: 1.1, velocity: 0 }, 1)).toBe(false);
    expect(isSpringAtRest({ value: 1.1, velocity: 0 }, 1, { delta: 0.2 })).toBe(true);
  });
});

describe('springLinearEasing', () => {
  it('serialises a settled spring to linear(): starts at 0, ends at 1, bouncy ones overshoot', () => {
    const { easing, durationMs } = springLinearEasing({ duration: 0.5, bounce: 0.3 });
    expect(easing.startsWith('linear(0, ')).toBe(true);
    expect(easing.endsWith(', 1)')).toBe(true);
    const values = easing.slice('linear('.length, -1).split(', ').map(Number);
    expect(Math.max(...values)).toBeGreaterThan(1.02);
    expect(durationMs % 16).toBe(0);
    expect(durationMs).toBeGreaterThan(300);
    expect(durationMs).toBeLessThan(2000);
    expect(values).toHaveLength(durationMs / 16 + 1);
  });

  it('a critically damped spring never exceeds 1 and gives up at maxMs', () => {
    const { easing } = springLinearEasing({ duration: 0.4, bounce: 0 });
    const values = easing.slice('linear('.length, -1).split(', ').map(Number);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    const slow = springLinearEasing({ duration: 10, bounce: 0.9 }, { maxMs: 500, sampleMs: 50 });
    expect(slow.durationMs).toBe(500);
  });
});
