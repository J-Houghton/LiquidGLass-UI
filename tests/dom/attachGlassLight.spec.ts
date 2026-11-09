// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { attachLiquidGlass } from '../../src/dom/attachLiquidGlass';
import { attachGlassLight, type GlassLightOptions } from '../../src/dom/attachGlassLight';
import { lightAngleFor, blendLightAngles, lightAngleDelta } from '../../src/motion/light';
import type { RGBAImage } from '../../src/core/image';

/** A frame queue and the clock it advances, `step` ms a frame. */
function frames(step = 16) {
  const queue: Array<(time: number) => void> = [];
  let clock = 0;
  return {
    animationFrame: (cb: (time: number) => void) => {
      queue.push(cb);
      return queue.length;
    },
    now: () => clock,
    run(n = 60) {
      for (let i = 0; i < n && queue.length; i++) {
        clock += step;
        for (const f of queue.splice(0)) f(clock);
      }
    },
    get pending() {
      return queue.length;
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

const VIEWPORT = { width: 1000, height: 600 };
const RECT = { left: 100, top: 100, width: 200, height: 100 }; // centre (200, 150)
const SCENE = { x: 500, y: -300 }; // 'viewport' for 1000×600
const sceneAngle = lightAngleFor(RECT, SCENE); // about -56.3°

function env(glassOptions: Parameters<typeof attachLiquidGlass>[1] = {}, step = 16) {
  document.body.innerHTML = '';
  const target = document.createElement('div');
  document.body.appendChild(target);
  target.getBoundingClientRect = () => ({ ...RECT, right: RECT.left + RECT.width, bottom: RECT.top + RECT.height, x: RECT.left, y: RECT.top, toJSON() {} }) as DOMRect;
  const encodeImage = async (_img: RGBAImage) => 'blob:x';
  const glass = attachLiquidGlass(target, { support: 'full', dpr: 1, encodeImage, revokeImage: () => {}, size: { width: 200, height: 100 }, radius: 20, ...glassOptions });
  const f = frames(step);
  const angles: number[] = [];
  const light = (opts: GlassLightOptions = {}) =>
    attachGlassLight(glass, {
      viewport: () => VIEWPORT,
      animationFrame: f.animationFrame,
      now: f.now,
      matchMedia: () => new FakeMql(false) as unknown as MediaQueryList,
      onAngle: (a) => angles.push(a),
      ...opts,
    });
  return { target, glass, f, light, angles };
}

const PE = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? MouseEvent;
const move = (x: number, y: number) => document.dispatchEvent(new PE('pointermove', { bubbles: true, clientX: x, clientY: y } as PointerEventInit));

describe('attachGlassLight', () => {
  it('snaps to the scene light on attach: the angle follows where the glass sits in the viewport', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light();
    expect(h.angle).toBeCloseTo(sceneAngle, 9);
    expect(h.running).toBe(false);
    expect(f.pending).toBe(0);
    await glass.refresh();
    expect(glass.params.specularAngleDeg).toBe(Math.round(sceneAngle * 10) / 10);
    const renders = glass.debug.renders;
    h.update();
    expect(f.pending).toBe(0); // nothing moved: no loop
    await glass.update({});
    expect(glass.debug.renders).toBe(renders); // and nothing written
  });

  it('a pointer within reach pulls the light toward it, eased over frames; out of reach it lets go', async () => {
    const { glass, f, light, angles } = env();
    await glass.ready;
    const h = light();
    h.setPointer({ x: 400, y: 150 }); // 100 px right of the glass, inside the 160 px radius
    expect(h.running).toBe(true);
    expect(h.target).toBeGreaterThan(sceneAngle); // toward 0° (light to the right)
    expect(h.target).toBeLessThan(0);
    f.run(200);
    expect(h.running).toBe(false);
    expect(h.angle).toBeCloseTo(h.target, 1);
    expect(angles.length).toBeGreaterThan(3); // several eased writes
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1] - 1e-9);

    // on the glass, 50 px right of the centre: a light 50 px up (half the shorter side) is 45° off
    // the vertical, so the pointer sets sin 45° of the direction
    h.setPointer({ x: 250, y: 150 });
    f.run(200);
    expect(h.target).toBeCloseTo(blendLightAngles(sceneAngle, 0, Math.SQRT1_2), 6);
    h.setPointer({ x: 200, y: 150 }); // right over the centre: no direction to give, the scene light shows
    f.run(200);
    expect(h.target).toBeCloseTo(sceneAngle, 6);

    h.setPointer({ x: 900, y: 150 }); // far away: back to the scene
    f.run(200);
    expect(h.angle).toBeCloseTo(sceneAngle, 1);
    await glass.refresh();
    expect(glass.params.specularAngleDeg).toBeCloseTo(sceneAngle, 0);
  });

  it('listens to pointer and scroll on the document and stops on destroy', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light();
    move(400, 150);
    expect(h.running).toBe(true);
    f.run(200);
    const pulled = h.angle;
    expect(pulled).toBeGreaterThan(sceneAngle);
    document.dispatchEvent(new PE('pointerout', { bubbles: true, relatedTarget: null } as PointerEventInit));
    f.run(200);
    expect(h.angle).toBeCloseTo(sceneAngle, 1);
    h.destroy();
    move(400, 150);
    expect(h.running).toBe(false);
    expect(f.pending).toBe(0);
    expect(h.angle).toBeCloseTo(sceneAngle, 1);
  });

  it('reduced motion snaps instead of easing', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light({ matchMedia: () => new FakeMql(true) as unknown as MediaQueryList });
    h.setPointer({ x: 400, y: 150 });
    expect(h.running).toBe(false);
    expect(f.pending).toBe(0);
    expect(h.angle).toBe(h.target);
  });

  it('scene: false with no pointer leaves the angle alone; a fixed point and a rule work', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light({ scene: false });
    expect(h.angle).toBe(60); // the parameter default, untouched
    h.setScene({ x: 200, y: 1000 }); // straight below
    f.run(200);
    expect(h.angle).toBeCloseTo(90, 1);
    h.setScene((v) => ({ x: v.width, y: 150 })); // the right edge of the viewport
    f.run(200);
    expect(h.angle).toBeCloseTo(0, 1);
  });

  it('smoothing 1 snaps; the easing takes the short way across the 180° wrap', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light({ smoothing: 1, scene: { x: -500, y: 150 } }); // light to the left: 180°
    expect(h.angle).toBeCloseTo(180, 9);
    expect(f.pending).toBe(0);
    const eased = light({ scene: { x: -500, y: 150 } });
    eased.setScene({ x: 200, y: 1000 }); // 90°: a quarter turn either way
    f.run(300);
    expect(Math.abs(((eased.angle % 180) + 180) % 180 - 90)).toBeLessThan(0.1);
  });

  it('is inert in frost mode', async () => {
    const { glass, f, light } = env({ support: 'frost' });
    await glass.ready;
    const h = light();
    h.setPointer({ x: 400, y: 150 });
    expect(h.angle).toBe(60);
    expect(f.pending).toBe(0);
  });
});

describe('attachGlassLight (glide)', () => {
  it('the pointer owns the light anywhere on the glass with elevation 0', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light({ pointer: { elevation: 0 } });
    h.setPointer({ x: 250, y: 150 });
    f.run(200);
    expect(h.target).toBeCloseTo(0, 6);
  });

  it('turns on a spring: gently at first, without overshoot, in the same time at any frame rate', async () => {
    const times: number[] = [];
    for (const step of [16, 7]) {
      const { glass, f, light } = env({}, step);
      await glass.ready;
      const h = light({ scene: { x: 200, y: -1000 } }); // straight above: -90
      h.setScene({ x: 1000, y: 150 }); // to the right: 0, a quarter turn
      const path: number[] = [];
      while (h.running && path.length < 1000) {
        f.run(1);
        path.push(h.angle);
      }
      expect(h.angle).toBe(0);
      // the first frame moves little, then it speeds up, and it never passes 0
      expect(path[0] + 90).toBeLessThan(2);
      expect(path[5] - path[4]).toBeGreaterThan(path[1] - path[0]);
      expect(Math.max(...path)).toBeLessThanOrEqual(0);
      // nine tenths of the turn in about 0.45 s
      times.push((path.findIndex((a) => a >= -9) + 1) * step);
    }
    expect(times[0]).toBeGreaterThan(380);
    expect(times[0]).toBeLessThan(520);
    expect(Math.abs(times[0] - times[1])).toBeLessThanOrEqual(16);
  });

  it('a new target mid-turn carries the speed it has instead of starting over', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light({ scene: { x: 200, y: -1000 } });
    h.setScene({ x: 1000, y: 150 });
    const path: number[] = [h.angle];
    for (let i = 0; i < 12; i++) {
      f.run(1);
      path.push(h.angle);
    }
    h.setScene({ x: 1000, y: 100 }); // a little further round, as a moving pointer would
    f.run(1);
    path.push(h.angle);
    const before = path[12] - path[11];
    const after = path[13] - path[12];
    expect(before).toBeGreaterThan(2); // well under way
    expect(Math.abs(after - before)).toBeLessThan(0.25 * before); // and still so: no restart from rest
  });

  it('a pointer crossing the glass near its centre turns the light smoothly', async () => {
    const sweep = async (opts: GlassLightOptions) => {
      const { glass, f, light } = env();
      await glass.ready;
      const h = light(opts);
      let prev = h.angle;
      let fastest = 0;
      // left to right, 5 px below the centre, 10 px a frame (600 px/s)
      for (let x = 60; x <= 340; x += 10) {
        h.setPointer({ x, y: 155 });
        f.run(1);
        fastest = Math.max(fastest, Math.abs(lightAngleDelta(prev, h.angle)));
        prev = h.angle;
      }
      return fastest;
    };
    const before = await sweep({ smoothing: 0.35, pointer: { elevation: 0 } }); // 2.0's behaviour
    const now = await sweep({});
    expect(before).toBeGreaterThan(25);
    expect(now).toBeLessThan(6);
  });

  it('scene: false rests where the light was: the pointer pulls it and lets it go back', async () => {
    const { glass, f, light } = env();
    await glass.ready;
    const h = light({ scene: false });
    h.setPointer({ x: 400, y: 150 });
    f.run(300);
    expect(h.angle).not.toBeCloseTo(60, 0);
    h.setPointer(null);
    f.run(300);
    expect(h.angle).toBeCloseTo(60, 1);
  });

  it('smoothing keeps the 2.0 per-frame easing', async () => {
    const { glass, f, light, angles } = env();
    await glass.ready;
    const h = light({ smoothing: 0.5, scene: { x: 200, y: -1000 } });
    h.setScene({ x: 1000, y: 150 });
    f.run(1);
    expect(angles.at(-1)).toBeCloseTo(-45, 1);
  });
});
