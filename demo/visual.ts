/**
 * Visual harness for screenshots. Renders one glass per query variant over a fixed backdrop.
 *
 *   /visual.html?a={"blurStage":"after"}&b={"blurStage":"before"}&base={"blur":1.5}
 *
 * `base` is merged into every variant; `a`, `b`, `c`, `d` are the variants (JSON patches of
 * GlassParams). `opts` is a JSON patch of attach options (e.g. `{"sizeBucket":1,"maxMapPixels":1e9}`)
 * applied to every glass. `mode=content` renders the (single) variant through `filter: url()` on
 * the backdrop element instead of `backdrop-filter` (content-side mode; one lens per content
 * element). `motion=press|release|drag&t=<ms>` attaches the motion with a manual clock and
 * freezes the frame `t` ms after a press (or after a release that follows a settled press, or
 * after a 2000 px/s impulse), so a mid-spring frame can be screenshotted deterministically.
 * `light=scene` aims the rim from the scene light above the viewport; `light=pointer:x,y` adds a
 * pointer at viewport px (x, y), both snapped (no easing) so the frame is deterministic.
 * `debug=1` shows the map instead of the glass. The document gets `data-ready="1"` once every
 * glass has rendered, which is what the screenshot script waits for.
 */
import {
  attachLiquidGlass,
  attachGlassMotion,
  attachGlassLight,
  DEFAULT_GLASS_PARAMS,
  type GlassLightHandle,
  type GlassMotionHandle,
  type GlassParams,
  type LiquidGlassHandle,
  type LiquidGlassOptions,
} from '../src/index.ts';

const q = new URLSearchParams(location.search);
const parse = (key: string): Partial<GlassParams> => {
  const v = q.get(key);
  return v ? (JSON.parse(v) as Partial<GlassParams>) : {};
};
const opts = (JSON.parse(q.get('opts') ?? '{}') as Partial<LiquidGlassOptions>) ?? {};

const base: Partial<GlassParams> = { width: 360, height: 180, radius: 48, bezelWidth: 48, ...parse('base') };
const contentMode = q.get('mode') === 'content';
const content = contentMode ? (document.querySelector('.backdrop') as HTMLElement) : null;
// content mode filters one element, which can carry one lens: only the first variant renders
const variants = (['a', 'b', 'c', 'd'] as const).filter((k) => k === 'a' || (!contentMode && q.has(k)));
const stage = document.getElementById('stage')!;
const handles: LiquidGlassHandle[] = [];

for (const key of variants) {
  const patch = parse(key);
  const params = { ...base, ...patch };
  const el = document.createElement('div');
  el.className = 'glass';
  el.style.width = `${params.width ?? DEFAULT_GLASS_PARAMS.width}px`;
  el.style.height = `${params.height ?? DEFAULT_GLASS_PARAMS.height}px`;
  const label = document.createElement('div');
  label.className = 'glass__label';
  // name_<key>=Text replaces the JSON caption (used for the README's preset strip)
  label.textContent = q.get(`name_${key}`) ?? `${key}: ${Object.keys(patch).length ? JSON.stringify(patch) : 'base'}`;
  el.appendChild(label);
  const debugEl = document.createElement('div');
  debugEl.className = 'glass__debug';
  debugEl.hidden = q.get('debug') !== '1';
  el.appendChild(debugEl);
  stage.appendChild(el);

  const handle = attachLiquidGlass(el, {
    ...opts,
    ...params,
    ...(content ? { content, mode: 'content' as const } : {}),
    radius: params.radius ?? DEFAULT_GLASS_PARAMS.radius,
    appear: 0,
    onRender: (h) => {
      debugEl.style.backgroundImage = h.debug.mapUrl ? `url(${h.debug.mapUrl})` : '';
    },
  });
  handles.push(handle);
}

// ---- motion under a manual clock (deterministic frames)
const motionMode = q.get('motion');
let clockMs = 0;
const frameQueue: Array<(time: number) => void> = [];
const motions: GlassMotionHandle[] = motionMode
  ? handles.map((h) =>
      attachGlassMotion(h, {
        pointerTarget: null,
        now: () => clockMs,
        animationFrame: (cb) => frameQueue.push(cb),
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
      }),
    )
  : [];
function runMotion(): void {
  if (!motionMode) return;
  const t = Number(q.get('t') ?? 120);
  const step = (until: number) => {
    while (clockMs < until) {
      clockMs = Math.min(until, clockMs + 16);
      for (const f of frameQueue.splice(0)) f(clockMs);
    }
  };
  if (motionMode === 'drag') {
    for (const m of motions) m.impulse(2000, 0);
    step(t);
    return;
  }
  for (const m of motions) m.press();
  if (motionMode === 'release') {
    step(1000);
    for (const m of motions) m.release();
    step(1000 + t);
  } else {
    step(t);
  }
}

// ---- page-driven light, snapped (deterministic frames)
const lightMode = q.get('light');
const lights: GlassLightHandle[] = lightMode
  ? handles.map((h) => attachGlassLight(h, { scene: 'viewport', pointer: lightMode.startsWith('pointer'), smoothing: 1, listenOn: null }))
  : [];
function applyLight(): void {
  if (!lightMode?.startsWith('pointer:')) return;
  const [x, y] = lightMode.slice('pointer:'.length).split(',').map(Number);
  for (const l of lights) l.setPointer({ x, y });
}

Promise.all(handles.map((h) => h.ready)).then(async () => {
  runMotion();
  applyLight();
  await Promise.all(handles.map((h) => h.refresh())); // the snapped angle is in the graph
  // one more frame so the browser has decoded the map images and painted the filter
  requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset.ready = '1')));
});
