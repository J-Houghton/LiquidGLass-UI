// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { attachLiquidGlass, type LiquidGlassHandle } from '../../src/dom/attachLiquidGlass';
import { attachGlassMotion, type GlassMotionOptions, type MotionFrame } from '../../src/dom/attachGlassMotion';
import type { RGBAImage } from '../../src/core/image';

/** Manual clock + frame queue standing in for performance.now / requestAnimationFrame. */
function clock() {
  let t = 0;
  const frames: Array<(time: number) => void> = [];
  return {
    now: () => t,
    animationFrame: (cb: (time: number) => void) => {
      frames.push(cb);
      return frames.length;
    },
    /** Advance in 16 ms frames, running whatever is queued at each one. */
    run(ms: number) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 16);
        for (const f of frames.splice(0)) f(t);
      }
    },
    get pending() {
      return frames.length;
    },
  };
}

class FakeMql {
  listeners: Array<(e: MediaQueryListEvent) => void> = [];
  constructor(public matches: boolean) {}
  addEventListener(_t: string, cb: (e: MediaQueryListEvent) => void) {
    this.listeners.push(cb);
  }
  removeEventListener(_t: string, cb: (e: MediaQueryListEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }
}

function env(glassOptions: Parameters<typeof attachLiquidGlass>[1] = {}) {
  document.body.innerHTML = '';
  const target = document.createElement('div');
  document.body.appendChild(target);
  const encodeImage = async (_img: RGBAImage) => 'blob:x';
  const glass = attachLiquidGlass(target, { support: 'full', dpr: 1, encodeImage, revokeImage: () => {}, size: { width: 200, height: 100 }, radius: 20, ...glassOptions });
  const c = clock();
  const frames: MotionFrame[] = [];
  const motion = (opts: GlassMotionOptions = {}) =>
    attachGlassMotion(glass, { now: c.now, animationFrame: c.animationFrame, matchMedia: () => new FakeMql(false) as unknown as MediaQueryList, onFrame: (f) => frames.push(f), ...opts });
  return { target, glass, c, motion, frames };
}

const PE = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? MouseEvent;
const pointer = (el: Element, type: string, init: Record<string, unknown>) =>
  el.dispatchEvent(new PE(type, { bubbles: true, cancelable: true, button: 0, ...init } as PointerEventInit));

describe('attachGlassMotion', () => {
  it('press lifts the glass on a spring and dims the lens; release overshoots and settles, then the loop sleeps', async () => {
    const { target, glass, c, motion, frames } = env();
    await glass.ready;
    const m = motion();
    expect(m.running).toBe(false);
    m.press();
    expect(m.running).toBe(true);
    expect(m.pressed).toBe(true);
    c.run(200);
    expect(m.running).toBe(true); // still ringing
    c.run(800); // a 0.35 s / 0.3 spring is within 1e-3 after about 0.6 s
    expect(m.frame.lift).toBeCloseTo(1.045, 3);
    expect(target.style.transform).toMatch(/^scale\(1\.045, 1\.045\)$/);
    await glass.refresh();
    expect(glass.intensity).toBeCloseTo(0.85, 2);
    expect(m.running).toBe(false); // settled while pressed: no frames queued
    expect(c.pending).toBe(0);

    m.release();
    expect(m.running).toBe(true);
    c.run(1000);
    const lifts = frames.map((f) => f.lift);
    expect(Math.min(...lifts)).toBeLessThan(1); // the release overshoots past rest
    expect(Math.max(...lifts)).toBeGreaterThan(1.045); // and the press overshot its target (bounce 0.3 ≈ 4.6 %)
    expect(Math.max(...lifts)).toBeLessThan(1.045 + 0.045 * 0.06);
    expect(m.frame).toMatchObject({ lift: 1, scaleX: 1, scaleY: 1, skewX: 0, intensity: 1, transform: '' });
    expect(target.style.transform).toBe('');
    await glass.refresh();
    expect(glass.intensity).toBe(1);
    expect(m.running).toBe(false);
    expect(c.pending).toBe(0);
  });

  it('impulse squashes along the velocity within the caps and decays back to rest', () => {
    const { target, c, motion } = env();
    const m = motion({ press: false });
    m.impulse(4000, 0);
    const f = m.frame; // first frame is written on wake? no: on the first tick
    expect(f.transform).toBe('');
    c.run(16);
    expect(m.frame.scaleX).toBeGreaterThan(1.02);
    expect(m.frame.scaleX).toBeLessThanOrEqual(1.12);
    expect(m.frame.scaleY).toBeLessThan(1);
    expect(m.frame.skewX).toBeGreaterThan(0);
    expect(m.frame.skewX).toBeLessThanOrEqual(14);
    expect(target.style.transform).toMatch(/^scale\([\d.]+, [\d.]+\) skewX\([\d.]+deg\)$/);
    c.run(3000);
    expect(m.running).toBe(false);
    expect(target.style.transform).toBe('');
    expect(m.frame.transform).toBe('');
  });

  it('pointer events drive press, drag velocity and release', async () => {
    const { target, glass, c, motion } = env();
    await glass.ready;
    const m = motion();
    pointer(target, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    expect(m.pressed).toBe(true);
    c.run(32);
    pointer(target, 'pointermove', { pointerId: 1, clientX: 70, clientY: 10 }); // 60 px in 32 ms: 1875 px/s
    c.run(16);
    expect(m.frame.skewX).toBeGreaterThan(0);
    expect(m.frame.scaleX).toBeGreaterThan(m.frame.lift);
    pointer(target, 'pointermove', { pointerId: 2, clientX: 0, clientY: 0 }); // another pointer: ignored
    pointer(document.body, 'pointerup', { pointerId: 1, clientX: 70, clientY: 10 }); // released anywhere in the document
    expect(m.pressed).toBe(false);
    c.run(3000);
    expect(m.running).toBe(false);
    expect(target.style.transform).toBe('');
  });

  it('hover lifts a little when enabled', () => {
    const { c, motion } = env();
    const m = motion({ hover: true, press: false, drag: false });
    m.hover(true);
    c.run(600);
    expect(m.frame.lift).toBeCloseTo(1.02, 3);
    m.hover(false);
    c.run(600);
    expect(m.frame.lift).toBe(1);
  });

  it('reduced motion snaps the press and ignores impulses', async () => {
    const { target, glass, c, motion } = env();
    await glass.ready;
    const m = motion({ matchMedia: () => new FakeMql(true) as unknown as MediaQueryList });
    m.press();
    expect(m.running).toBe(false);
    expect(c.pending).toBe(0);
    expect(m.frame.lift).toBeCloseTo(1.045, 9);
    expect(target.style.transform).toBe('scale(1.045, 1.045)');
    m.impulse(5000, 0);
    expect(m.frame.skewX).toBe(0);
    m.release();
    expect(target.style.transform).toBe('');
    await glass.refresh();
    expect(glass.intensity).toBe(1);
  });

  it('keeps an existing inline transform in front of its own and restores it', () => {
    const { target, c, motion } = env();
    target.style.transform = 'translate(10px, 0px)';
    const m = motion({ press: { scale: 1.1, dim: 1 } });
    m.press();
    c.run(16);
    expect(target.style.transform).toMatch(/^translate\(10px, 0px\) scale\(/);
    m.destroy();
    expect(target.style.transform).toBe('translate(10px, 0px)');
  });

  it('writes no transform in content mode by default, but still dims; an explicit element is honoured', async () => {
    const content = document.createElement('section');
    document.body.appendChild(content);
    const { target, glass, c, motion } = env({ support: 'frost', contentSupport: true, content, mode: 'content' });
    expect(glass.mode).toBe('content');
    await glass.ready;
    const m = motion();
    m.press();
    c.run(1000);
    expect(target.style.transform).toBe('');
    expect(m.frame.lift).toBeCloseTo(1.045, 3);
    await glass.refresh();
    expect(glass.intensity).toBeCloseTo(0.85, 2);
    const other = document.createElement('div');
    const m2 = attachGlassMotion(glass, { element: other, now: c.now, animationFrame: c.animationFrame, matchMedia: () => new FakeMql(false) as unknown as MediaQueryList });
    m2.press();
    c.run(1000);
    expect(other.style.transform).toBe('scale(1.045, 1.045)');
    m.destroy();
    m2.destroy();
  });

  it('destroy stops the loop, drops listeners, restores transform and intensity', async () => {
    const { target, glass, c, motion } = env();
    await glass.ready;
    const m = motion();
    m.press();
    c.run(100);
    expect(target.style.transform).not.toBe('');
    m.destroy();
    expect(m.running).toBe(false);
    expect(target.style.transform).toBe('');
    c.run(500); // stale frames run but write nothing
    expect(target.style.transform).toBe('');
    await glass.refresh();
    expect(glass.intensity).toBe(1);
    pointer(target, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    expect(m.pressed).toBe(false);
    m.press();
    expect(m.running).toBe(false);
  });

  it('accepts a bare glass-shaped object (target + setIntensity) and works without a pointer target', () => {
    const el = document.createElement('div');
    const set: number[] = [];
    const c = clock();
    const m = attachGlassMotion(
      { target: el, destroyed: false, setIntensity: (k: number) => (set.push(k), Promise.resolve()) },
      { pointerTarget: null, now: c.now, animationFrame: c.animationFrame, matchMedia: () => new FakeMql(false) as unknown as MediaQueryList },
    );
    m.press();
    c.run(1000);
    expect(el.style.transform).toBe('scale(1.045, 1.045)');
    expect(set.at(-1)).toBeCloseTo(0.85, 2);
    m.destroy();
    expect(set.at(-1)).toBe(1);
  });
});

describe('attachGlassMotion (enter)', () => {
  it('springs in from a smaller glass: the first frame at once, a little overshoot, then nothing', async () => {
    const { target, glass, c, motion, frames } = env();
    await glass.ready;
    const m = motion();
    m.enter();
    expect(target.style.transform).toBe('scale(0.94, 0.94)'); // before any frame: never seen full size first
    expect(m.running).toBe(true);
    c.run(1500);
    const scales = frames.map((f) => f.scaleX);
    expect(Math.min(...scales)).toBeCloseTo(0.94, 9);
    expect(Math.max(...scales)).toBeGreaterThan(1); // settles with an overshoot (bounce 0.35)
    expect(Math.max(...scales)).toBeLessThan(1.01);
    expect(m.frame).toMatchObject({ scaleX: 1, scaleY: 1, lift: 1, transform: '' });
    expect(target.style.transform).toBe('');
    expect(m.running).toBe(false);
    expect(c.pending).toBe(0);
    await glass.refresh();
    expect(glass.intensity).toBe(1); // the lens is the lens's own business (appear)
  });

  it('takes a scale per axis and a spring, as options or as defaults', () => {
    const { target, c, motion, frames } = env();
    const m = motion({ enter: { from: { x: 0.9, y: 1.05 } } });
    m.enter();
    expect(target.style.transform).toBe('scale(0.9, 1.05)');
    c.run(1500);
    expect(target.style.transform).toBe('');
    m.enter({ from: 0.8, spring: { duration: 0.3, bounce: 0 } });
    expect(target.style.transform).toBe('scale(0.8, 0.8)');
    frames.length = 0;
    c.run(1000);
    expect(Math.max(...frames.map((f) => f.scaleX))).toBeLessThanOrEqual(1); // no bounce, no overshoot
    expect(m.running).toBe(false);
  });

  it('combines with a press', () => {
    const { c, motion } = env();
    const m = motion();
    m.enter();
    m.press();
    c.run(1500);
    expect(m.frame.scaleX).toBeCloseTo(1.045, 3);
    expect(m.frame.lift).toBeCloseTo(1.045, 3);
  });

  it('does nothing under reduced motion', () => {
    const { target, c, motion } = env();
    const m = motion({ matchMedia: () => new FakeMql(true) as unknown as MediaQueryList });
    m.enter();
    expect(target.style.transform).toBe('');
    expect(m.running).toBe(false);
    expect(c.pending).toBe(0);
  });

  it('destroy mid-entrance puts the transform back', () => {
    const { target, c, motion } = env();
    target.style.transform = 'translateX(4px)';
    const m = motion();
    m.enter();
    c.run(100);
    expect(target.style.transform).toMatch(/^translateX\(4px\) scale\(/);
    m.destroy();
    expect(target.style.transform).toBe('translateX(4px)');
  });
});

// keep the imported type referenced for readers of this file
export type _Handle = LiquidGlassHandle;
