import { stepSpring, springPhysics, isSpringAtRest, type SpringConfig, type SpringPhysics, type SpringState } from '../motion/spring.js';
import {
  squashSample,
  squashDecay,
  squashDeformation,
  isSquashAtRest,
  DEFAULT_SQUASH,
  SQUASH_REST,
  type SquashConfig,
  type SquashState,
} from '../motion/squash.js';
import type { GlassFilterHandle } from './createGlassFilter.js';

/**
 * Drives a glass with the motion model: a spring on press/hover (scale up, relax the lens a
 * little, overshoot back on release), velocity squash while dragging, and a spring in on arrival.
 * One requestAnimationFrame
 * loop runs while anything moves and sleeps at rest; the transform is written to the target and
 * removed again when everything is still. Reduced motion snaps the springs and disables the
 * squash, as Apple's Reduce Motion contract asks.
 */

export interface PressMotion {
  /** Scale while pressed. Default 1.045 (LiquidGlassJS; Apple's interactive glass grows a touch). */
  scale?: number;
  /** Lens intensity while pressed, so the refraction relaxes under the finger. Default 0.85; 1 disables. */
  dim?: number;
  /** Spring for press and release. Default `{ duration: 0.35, bounce: 0.3 }`. */
  spring?: SpringConfig;
}

export interface HoverMotion {
  /** Scale while hovered. Default 1.02. */
  scale?: number;
  /** Default `{ duration: 0.3, bounce: 0.15 }`. */
  spring?: SpringConfig;
}

export interface EnterMotion {
  /** Scale the glass springs in from: one for both axes, or `{ x, y }`. Default 0.94. */
  from?: number | { x: number; y: number };
  /** Default `{ duration: 0.6, bounce: 0.35 }`: it settles with a little overshoot, like a release. */
  spring?: SpringConfig;
}

export interface GlassMotionOptions {
  /** Press feedback. Default true. */
  press?: boolean | PressMotion;
  /** Squash and stretch from pointer velocity while pressed. Default true. */
  drag?: boolean | Partial<SquashConfig>;
  /** Lift on hover. Default false. */
  hover?: boolean | HoverMotion;
  /** Defaults for `handle.enter()`. */
  enter?: EnterMotion;
  /** Snap springs and disable squash under `prefers-reduced-motion`. Default true. */
  respectReducedMotion?: boolean;
  /**
   * Element the transform is written to. Default: the glass target in backdrop mode, nothing in
   * content mode (the lens is painted by the content element and would not follow). `null`
   * writes nothing; read `onFrame` or `handle.frame` instead.
   */
  element?: HTMLElement | null;
  /** Element whose pointer events drive press and drag. Default: the glass target. `null`: none. */
  pointerTarget?: HTMLElement | null;
  /** Called after every frame. */
  onFrame?: (frame: MotionFrame) => void;
  /** `requestAnimationFrame` (test seam). */
  animationFrame?: (callback: (time: number) => void) => unknown;
  /** Clock in ms (test seam). Default `performance.now`. */
  now?: () => number;
  /** `matchMedia` (test seam). */
  matchMedia?: (query: string) => MediaQueryList;
}

export interface MotionFrame {
  /** Final scales: press/hover lift times the entrance and the squash. */
  scaleX: number;
  scaleY: number;
  /** Shear from the squash, degrees. */
  skewX: number;
  /** Press/hover scale alone (1 at rest; below 1 during a release overshoot). */
  lift: number;
  /** Lens intensity this frame implies (1 at rest). */
  intensity: number;
  /** The CSS transform for this frame ('' at rest). */
  transform: string;
}

export interface GlassMotionHandle {
  press(): void;
  release(): void;
  hover(on: boolean): void;
  /**
   * Spring in, the glass arriving: from `from` to its own size, settling with a little overshoot.
   * Play it as the glass appears (with the lens's `appear`, or your own fade-in); the first frame
   * is written at once, so the glass is never seen at full size first. Nothing under reduced motion.
   */
  enter(options?: EnterMotion): void;
  /** Feed a velocity sample in px/s (your own drag code). Ignored under reduced motion. */
  impulse(vx: number, vy: number): void;
  /** True while the frame loop is running. */
  readonly running: boolean;
  readonly pressed: boolean;
  readonly frame: Readonly<MotionFrame>;
  destroy(): void;
}

/** What the motion needs from a glass handle (a `LiquidGlassHandle`, or anything shaped like it). */
export interface MotionGlass {
  readonly target: HTMLElement;
  readonly mode?: string;
  readonly destroyed: boolean;
  setIntensity(k: number): Promise<void>;
}

const REST_FRAME: Readonly<MotionFrame> = Object.freeze({ scaleX: 1, scaleY: 1, skewX: 0, lift: 1, intensity: 1, transform: '' });
const ENTER: Required<EnterMotion> = { from: 0.94, spring: { duration: 0.6, bounce: 0.35 } };
const UNIT: Readonly<SpringState> = Object.freeze({ value: 0, velocity: 0 });
const REST = { delta: 1e-3, speed: 1e-2 };
const fmt = (v: number): string => String(Math.round(v * 10000) / 10000);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function attachGlassMotion(glass: MotionGlass, options: GlassMotionOptions = {}): GlassMotionHandle {
  const pressOpt = options.press ?? true;
  const dragOpt = options.drag ?? true;
  const hoverOpt = options.hover ?? false;
  const press: Required<PressMotion> | null = pressOpt
    ? { scale: 1.045, dim: 0.85, spring: { duration: 0.35, bounce: 0.3 }, ...(typeof pressOpt === 'object' ? pressOpt : {}) }
    : null;
  const hover: Required<HoverMotion> | null = hoverOpt
    ? { scale: 1.02, spring: { duration: 0.3, bounce: 0.15 }, ...(typeof hoverOpt === 'object' ? hoverOpt : {}) }
    : null;
  const squashConfig: SquashConfig | null = dragOpt ? { ...DEFAULT_SQUASH, ...(typeof dragOpt === 'object' ? dragOpt : {}) } : null;
  const pressPhysics: SpringPhysics = springPhysics(press?.spring);
  const hoverPhysics: SpringPhysics = springPhysics(hover?.spring);
  const enterDefaults: Required<EnterMotion> = { ...ENTER, ...options.enter };

  const element = options.element === undefined ? (glass.mode === 'content' ? null : glass.target) : options.element;
  const pointerTarget = options.pointerTarget === undefined ? glass.target : options.pointerTarget;
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
    if (reduced) snapAll();
  };
  reducedQuery?.addEventListener?.('change', onReducedChange);

  // ---- state
  let pressAmount: SpringState = { ...UNIT }; // 0 released .. 1 pressed
  let hoverAmount: SpringState = { ...UNIT };
  let pressTarget = 0;
  let hoverTarget = 0;
  // the entrance: 1 at its start scale .. 0 at rest (below 0 in the overshoot)
  let enterAmount: SpringState = { ...UNIT };
  let enterFrom = { x: 1, y: 1 };
  let enterPhysics: SpringPhysics = springPhysics(enterDefaults.spring);
  let squash: SquashState = { ...SQUASH_REST };
  let frame: MotionFrame = { ...REST_FRAME };
  let running = false;
  let destroyed = false;
  let last = 0;
  let lastIntensity = 1;
  const styleEl = element ? (element.style as unknown as Record<string, string>) : null;
  const savedTransform = styleEl ? (styleEl.transform ?? '') : '';
  let wroteTransform = false;

  function compute(): MotionFrame {
    const lift = 1 + (press ? (press.scale - 1) * pressAmount.value : 0) + (hover ? (hover.scale - 1) * hoverAmount.value : 0);
    const d = squashConfig ? squashDeformation(squash, squashConfig) : { scaleX: 1, scaleY: 1, skewX: 0, magnitude: 0 };
    const scaleX = lift * (1 + (enterFrom.x - 1) * enterAmount.value) * d.scaleX;
    const scaleY = lift * (1 + (enterFrom.y - 1) * enterAmount.value) * d.scaleY;
    const intensity = press ? 1 - (1 - press.dim) * clamp01(pressAmount.value) : 1;
    const identity = Math.abs(scaleX - 1) < 1e-4 && Math.abs(scaleY - 1) < 1e-4 && Math.abs(d.skewX) < 1e-3;
    const own = identity ? '' : `scale(${fmt(scaleX)}, ${fmt(scaleY)})${Math.abs(d.skewX) >= 1e-3 ? ` skewX(${fmt(d.skewX)}deg)` : ''}`;
    const transform = own && savedTransform ? `${savedTransform} ${own}` : own;
    return { scaleX, scaleY, skewX: d.skewX, lift, intensity, transform };
  }

  function atRest(): boolean {
    return (
      isSpringAtRest(pressAmount, pressTarget, REST) &&
      isSpringAtRest(hoverAmount, hoverTarget, REST) &&
      isSpringAtRest(enterAmount, 0, REST) &&
      (!squashConfig || isSquashAtRest(squash, squashConfig))
    );
  }

  function apply(next: MotionFrame): void {
    frame = next;
    if (styleEl) {
      if (next.transform) {
        styleEl.transform = next.transform;
        wroteTransform = true;
      } else if (wroteTransform) {
        styleEl.transform = savedTransform;
        wroteTransform = false;
      }
    }
    if (!glass.destroyed && (Math.abs(next.intensity - lastIntensity) > 2e-3 || (next.intensity === 1 && lastIntensity !== 1))) {
      lastIntensity = next.intensity;
      void glass.setIntensity(next.intensity);
    }
    options.onFrame?.(next);
  }

  function settle(): void {
    // the exact rest frame, so nothing is left a hair off
    pressAmount = { value: pressTarget, velocity: 0 };
    hoverAmount = { value: hoverTarget, velocity: 0 };
    enterAmount = { ...UNIT };
    if (squashConfig) squash = { ...SQUASH_REST };
    apply(compute());
  }

  function tick(): void {
    if (destroyed) return;
    const t = now();
    const dt = Math.max(0, (t - last) / 1000);
    last = t;
    pressAmount = stepSpring(pressAmount, pressTarget, dt, pressPhysics);
    hoverAmount = stepSpring(hoverAmount, hoverTarget, dt, hoverPhysics);
    enterAmount = stepSpring(enterAmount, 0, dt, enterPhysics);
    if (squashConfig) squash = squashDecay(squash, dt, squashConfig);
    if (atRest()) {
      running = false;
      settle();
      return;
    }
    apply(compute());
    raf!(tick);
  }

  function wake(): void {
    if (destroyed) return;
    if (reduced || !raf) {
      snapAll();
      return;
    }
    if (running) return;
    running = true;
    last = now();
    raf(tick);
  }

  function snapAll(): void {
    running = false;
    settle();
  }

  // ---- pointer wiring
  let pointerId: number | null = null;
  let px = 0;
  let py = 0;
  let pt = 0;
  const doc = pointerTarget?.ownerDocument ?? null;

  const onPointerDown = (e: PointerEvent) => {
    if (pointerId !== null || (e.button !== undefined && e.button !== 0)) return;
    pointerId = e.pointerId;
    px = e.clientX;
    py = e.clientY;
    pt = now();
    handle.press();
    doc?.addEventListener('pointerup', onPointerUp, true);
    doc?.addEventListener('pointercancel', onPointerUp, true);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    const t = now();
    const dt = (t - pt) / 1000;
    if (dt > 0) handle.impulse((e.clientX - px) / dt, (e.clientY - py) / dt);
    px = e.clientX;
    py = e.clientY;
    pt = t;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    doc?.removeEventListener('pointerup', onPointerUp, true);
    doc?.removeEventListener('pointercancel', onPointerUp, true);
    handle.release();
  };
  const onEnter = () => handle.hover(true);
  const onLeave = () => handle.hover(false);

  if (pointerTarget) {
    if (press || squashConfig) {
      pointerTarget.addEventListener('pointerdown', onPointerDown);
      pointerTarget.addEventListener('pointermove', onPointerMove);
    }
    if (hover) {
      pointerTarget.addEventListener('pointerenter', onEnter);
      pointerTarget.addEventListener('pointerleave', onLeave);
    }
  }

  const handle: GlassMotionHandle = {
    press() {
      if (destroyed || !press || pressTarget === 1) return;
      pressTarget = 1;
      wake();
    },
    release() {
      if (destroyed || !press || pressTarget === 0) return;
      pressTarget = 0;
      wake();
    },
    hover(on: boolean) {
      if (destroyed || !hover) return;
      const next = on ? 1 : 0;
      if (hoverTarget === next) return;
      hoverTarget = next;
      wake();
    },
    enter(opts: EnterMotion = {}) {
      if (destroyed || reduced || !raf) return;
      const from = opts.from ?? enterDefaults.from;
      enterFrom = typeof from === 'number' ? { x: from, y: from } : { x: from.x, y: from.y };
      enterPhysics = springPhysics(opts.spring ?? enterDefaults.spring);
      enterAmount = { value: 1, velocity: 0 };
      apply(compute());
      wake();
    },
    impulse(vx: number, vy: number) {
      if (destroyed || !squashConfig || reduced) return;
      squash = squashSample(squash, vx, vy, squashConfig);
      wake();
    },
    get running() {
      return running;
    },
    get pressed() {
      return pressTarget === 1;
    },
    get frame() {
      return frame;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      pressTarget = 0;
      hoverTarget = 0;
      pointerId = null;
      reducedQuery?.removeEventListener?.('change', onReducedChange);
      if (pointerTarget) {
        pointerTarget.removeEventListener('pointerdown', onPointerDown);
        pointerTarget.removeEventListener('pointermove', onPointerMove);
        pointerTarget.removeEventListener('pointerenter', onEnter);
        pointerTarget.removeEventListener('pointerleave', onLeave);
      }
      doc?.removeEventListener('pointerup', onPointerUp, true);
      doc?.removeEventListener('pointercancel', onPointerUp, true);
      if (styleEl && wroteTransform) styleEl.transform = savedTransform;
      if (lastIntensity !== 1 && !glass.destroyed) void glass.setIntensity(1);
      frame = { ...REST_FRAME };
    },
  };
  return handle;
}

/** The glass handles `attachGlassMotion` accepts: `LiquidGlassHandle` or a bare filter handle plus a target. */
export type MotionCompatibleHandle = MotionGlass | (GlassFilterHandle & { target: HTMLElement });
