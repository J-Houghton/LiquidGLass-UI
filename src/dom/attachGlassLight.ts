import {
  approachLightAngle,
  blendLightAngles,
  lightAngleDelta,
  lightAngleFor,
  pointerPull,
  type Point,
  type Rect,
} from '../motion/light.js';
import { springPhysics, stepSpring, type SpringConfig, type SpringState } from '../motion/spring.js';
import type { GlassParams } from '../core/params.js';

/**
 * Drives a glass's light direction from the page: a scene light fixed relative to the viewport
 * (above its top centre by default), so every glass is lit according to where it sits and keeps
 * being so while the page scrolls, blended toward the pointer when it comes within reach. Each
 * change is a `specularAngleDeg` update, which is a graph attribute: no map work, cheap per frame.
 * The angle glides toward its target on a spring, in one requestAnimationFrame loop that sleeps
 * at rest.
 */

export type SceneLight =
  /** Above the viewport's top centre, half a viewport height up. */
  | 'viewport'
  /** A fixed point in viewport px. */
  | Point
  /** Your own rule, from the viewport size. */
  | ((viewport: { width: number; height: number }) => Point)
  /** No scene light: the angle stays where it is unless the pointer takes over. */
  | false;

export interface PointerLight {
  /** How far from the glass the pointer starts to pull, px. Default 160. */
  radius?: number;
  /**
   * How high above the page the pointer's light sits, px. Right above the glass's centre it
   * lights every side alike and the scene light shows through; the further off-centre, the more
   * it takes over. Default: half the glass's shorter side. 0: the pointer owns the light anywhere
   * on the glass (the direction then swings fast near the centre).
   */
  elevation?: number;
}

export interface GlassLightOptions {
  /** Default `'viewport'`. */
  scene?: SceneLight;
  /** Follow the pointer within reach of the glass. `false` disables. Default true. */
  pointer?: boolean | PointerLight;
  /**
   * How the light turns toward a new direction: a spring, so it starts gently, keeps its speed
   * through a change of course and takes the same time at any frame rate. Default
   * `{ duration: 0.7, bounce: 0 }` (no overshoot; about 0.45 s to cover nine tenths of a turn).
   */
  spring?: SpringConfig;
  /**
   * The 2.0 easing: a fraction of the remaining turn per frame (so faster on a faster display).
   * When given, it replaces `spring`; 1 snaps.
   */
  smoothing?: number;
  /** Snap instead of easing under `prefers-reduced-motion`. Default true. */
  respectReducedMotion?: boolean;
  /**
   * Element whose document and window supply pointer, scroll and resize events. Default: the
   * glass target. `null`: no listeners; drive it with `setPointer()` and `update()`.
   */
  listenOn?: HTMLElement | null;
  /** Viewport size (test seam). Default `window.innerWidth` × `innerHeight`. */
  viewport?: () => { width: number; height: number };
  /** Called whenever a new angle is written. */
  onAngle?: (angleDeg: number) => void;
  /** `requestAnimationFrame` (test seam). */
  animationFrame?: (callback: (time: number) => void) => unknown;
  /** Clock in ms (test seam). Default `performance.now`. */
  now?: () => number;
  /** `matchMedia` (test seam). */
  matchMedia?: (query: string) => MediaQueryList;
}

export interface GlassLightHandle {
  /** The angle currently written to the glass. */
  readonly angle: number;
  /** Where the angle is heading. */
  readonly target: number;
  /** True while the easing loop runs. */
  readonly running: boolean;
  /** Re-measure the glass and recompute (after moving it, or a layout change the listeners cannot see). */
  update(): void;
  setScene(scene: SceneLight): void;
  /** Feed a pointer position in viewport px, or `null` when it leaves. */
  setPointer(point: Point | null): void;
  destroy(): void;
}

/** What the light needs from a glass handle. */
export interface LightGlass {
  readonly target: HTMLElement;
  readonly params: Readonly<Pick<GlassParams, 'specularAngleDeg'>>;
  readonly destroyed: boolean;
  readonly mode?: string;
  update(patch: Partial<GlassParams>): Promise<void>;
}

const DEFAULT_RADIUS = 160;
const DEFAULT_SPRING: SpringConfig = { duration: 0.7, bounce: 0 };
const REST_DEG = 0.05;
/** Degrees per second below which a settled light counts as still. */
const REST_SPEED = 0.5;

export function attachGlassLight(glass: LightGlass, options: GlassLightOptions = {}): GlassLightHandle {
  let scene: SceneLight = options.scene ?? 'viewport';
  const pointerOpt = options.pointer ?? true;
  const pointerOn = pointerOpt !== false;
  const radius = typeof pointerOpt === 'object' ? (pointerOpt.radius ?? DEFAULT_RADIUS) : DEFAULT_RADIUS;
  const elevation = typeof pointerOpt === 'object' ? pointerOpt.elevation : undefined;
  const smoothing = options.smoothing;
  const physics = springPhysics(options.spring ?? DEFAULT_SPRING);
  const listenOn = options.listenOn === undefined ? glass.target : options.listenOn;
  const viewport =
    options.viewport ??
    (() => ({
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
    }));
  const raf =
    options.animationFrame ??
    (typeof requestAnimationFrame === 'function' ? (cb: (time: number) => void) => requestAnimationFrame(cb) : undefined);
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const matchMediaFn =
    options.matchMedia ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined);
  const reducedQuery = (options.respectReducedMotion ?? true) ? (matchMediaFn?.('(prefers-reduced-motion: reduce)') ?? null) : null;
  let reduced = reducedQuery?.matches ?? false;
  const onReducedChange = (e: MediaQueryListEvent) => {
    reduced = e.matches;
  };
  reducedQuery?.addEventListener?.('change', onReducedChange);

  let angle = glass.params.specularAngleDeg;
  let velocity = 0;
  let target = angle;
  let written = angle;
  /** Where the light rests with no scene light and no pointer: where it was. */
  let rest = angle;
  let pointer: Point | null = null;
  let running = false;
  let destroyed = false;
  let last = 0;

  const rect = (): Rect => {
    const r = glass.target.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  const scenePoint = (): Point | null => {
    if (scene === false) return null;
    if (scene === 'viewport') {
      const v = viewport();
      return { x: v.width / 2, y: -v.height / 2 };
    }
    return typeof scene === 'function' ? scene(viewport()) : scene;
  };

  function write(): void {
    const rounded = Math.round(angle * 10) / 10;
    if (rounded === written || glass.destroyed) return;
    written = rounded;
    void glass.update({ specularAngleDeg: rounded });
    options.onAngle?.(rounded);
  }

  function snap(): void {
    angle = target;
    velocity = 0;
    write();
  }

  function retarget(): void {
    if (destroyed || glass.destroyed) return;
    const r = rect();
    const s = scenePoint();
    const base = s ? lightAngleFor(r, s) : rest;
    const pull = pointerOn && pointer ? pointerPull(r, pointer, radius, elevation ?? Math.min(r.width, r.height) / 2) : 0;
    target = pull > 0 ? blendLightAngles(base, lightAngleFor(r, pointer!), pull) : base;
    if (reduced || (smoothing ?? 0) >= 1 || !raf) return snap();
    if (!running && Math.abs(lightAngleDelta(angle, target)) < REST_DEG) return snap();
    if (!running) {
      running = true;
      last = now();
      raf(tick);
    }
  }

  function tick(): void {
    if (destroyed) return;
    const t = now();
    const dt = Math.max(0, (t - last) / 1000);
    last = t;
    if (smoothing !== undefined) {
      angle = approachLightAngle(angle, target, smoothing);
    } else {
      // the spring runs on the unwrapped angle, toward the copy of the target nearest it
      const s: SpringState = stepSpring({ value: angle, velocity }, angle + lightAngleDelta(angle, target), dt, physics);
      angle = s.value;
      velocity = s.velocity;
    }
    if (Math.abs(lightAngleDelta(angle, target)) < REST_DEG && Math.abs(velocity) < REST_SPEED) {
      running = false;
      return snap();
    }
    write();
    raf!(tick);
  }

  // ---- listeners
  const doc = listenOn?.ownerDocument ?? null;
  const win = doc?.defaultView ?? null;
  const onMove = (e: PointerEvent) => handle.setPointer({ x: e.clientX, y: e.clientY });
  const onLeave = (e: PointerEvent) => {
    if (e.relatedTarget === null) handle.setPointer(null);
  };
  const onLayout = () => handle.update();
  const inert = glass.mode === 'frost';
  if (!inert && doc && typeof doc.addEventListener === 'function') {
    if (pointerOn) {
      doc.addEventListener('pointermove', onMove, { passive: true });
      doc.addEventListener('pointerout', onLeave, { passive: true });
    }
    doc.addEventListener('scroll', onLayout, { capture: true, passive: true });
    win?.addEventListener('resize', onLayout, { passive: true });
  }

  const handle: GlassLightHandle = {
    get angle() {
      return angle;
    },
    get target() {
      return target;
    },
    get running() {
      return running;
    },
    update() {
      if (!inert) retarget();
    },
    setScene(next) {
      // turning the scene light off leaves the light where it is heading
      if (next === false && scene !== false) rest = target;
      scene = next;
      if (!inert) retarget();
    },
    setPointer(point) {
      if (!pointerOn || inert) return;
      pointer = point;
      retarget();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      reducedQuery?.removeEventListener?.('change', onReducedChange);
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerout', onLeave);
        doc.removeEventListener('scroll', onLayout, { capture: true });
        win?.removeEventListener('resize', onLayout);
      }
    },
  };

  // the first placement is a snap, so a page does not open with every rim swinging into place
  if (!inert) {
    const r = rect();
    const s = scenePoint();
    if (s) {
      angle = target = lightAngleFor(r, s);
      write();
    }
  }
  return handle;
}
