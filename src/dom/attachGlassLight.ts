import {
  approachLightAngle,
  distanceToRect,
  lightAngleDelta,
  lightAngleFor,
  mixPoints,
  pointerWeight,
  type Point,
  type Rect,
} from '../motion/light.js';
import type { GlassParams } from '../core/params.js';

/**
 * Drives a glass's light direction from the page: a scene light fixed relative to the viewport
 * (above its top centre by default), so every glass is lit according to where it sits and keeps
 * being so while the page scrolls, blended toward the pointer when it comes within reach. Each
 * change is a `specularAngleDeg` update, which is a graph attribute: no map work, cheap per frame.
 * Angles ease toward their target in one requestAnimationFrame loop that sleeps at rest.
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

export interface GlassLightOptions {
  /** Default `'viewport'`. */
  scene?: SceneLight;
  /** Follow the pointer within `radius` px of the glass (default 160). `false` disables. Default true. */
  pointer?: boolean | { radius?: number };
  /** Per-frame fraction of the remaining turn (1 snaps, 0 freezes). Default 0.35. */
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
const REST_DEG = 0.05;

export function attachGlassLight(glass: LightGlass, options: GlassLightOptions = {}): GlassLightHandle {
  let scene: SceneLight = options.scene ?? 'viewport';
  const pointerOpt = options.pointer ?? true;
  const radius = pointerOpt ? (typeof pointerOpt === 'object' ? (pointerOpt.radius ?? DEFAULT_RADIUS) : DEFAULT_RADIUS) : 0;
  const pointerOn = pointerOpt !== false;
  const smoothing = options.smoothing ?? 0.35;
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
  const matchMediaFn =
    options.matchMedia ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined);
  const reducedQuery = (options.respectReducedMotion ?? true) ? (matchMediaFn?.('(prefers-reduced-motion: reduce)') ?? null) : null;
  let reduced = reducedQuery?.matches ?? false;
  const onReducedChange = (e: MediaQueryListEvent) => {
    reduced = e.matches;
  };
  reducedQuery?.addEventListener?.('change', onReducedChange);

  let angle = glass.params.specularAngleDeg;
  let target = angle;
  let written = angle;
  let pointer: Point | null = null;
  let running = false;
  let destroyed = false;

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

  function retarget(): void {
    if (destroyed || glass.destroyed) return;
    const r = rect();
    const s = scenePoint();
    let light: Point | null = s;
    if (pointerOn && pointer) {
      const w = pointerWeight(distanceToRect(pointer, r), radius);
      if (w > 0) light = s ? mixPoints(s, pointer, w) : pointer;
    }
    if (!light) return;
    target = lightAngleFor(r, light);
    if (reduced || smoothing >= 1 || !raf || Math.abs(lightAngleDelta(angle, target)) < REST_DEG) {
      angle = target;
      write();
      return;
    }
    if (!running) {
      running = true;
      raf(tick);
    }
  }

  function tick(): void {
    if (destroyed) return;
    angle = approachLightAngle(angle, target, smoothing);
    if (Math.abs(lightAngleDelta(angle, target)) < REST_DEG) {
      angle = target;
      running = false;
      write();
      return;
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
