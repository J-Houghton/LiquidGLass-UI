import {
  DEFAULT_GLASS_PARAMS,
  GLASS_PARAM_KEYS,
  resolveGlassParams,
  type GlassParams,
  type ResolvedGlassParams,
} from '../core/params.js';
import { displacementCurve } from '../core/optics/disp1d.js';
import { lensMaps, maxAbs } from '../core/optics/disp2d.js';
import { buildFilterSpec, type FilterSpec } from '../core/filters/spec.js';
import { createFilterSvg, applyFilterSpec, type ElementFactory } from './mountFilter.js';
import { encodeImageToBlobUrl, revokeBlobUrl, type ImageEncoder, type UrlRevoker } from './encodeImage.js';
import { MapRegistry, UrlSlot, defaultMapRegistry, type LensMapUrls } from './mapCache.js';

export interface GlassFilterOptions extends Partial<GlassParams> {
  /** Filter id. Default: auto-generated, unique per page. */
  id?: string;
  /**
   * Where the hidden 0×0 `<svg>` is appended. Default: inside `host`. Keeping it in the same
   * tree scope as the styled element lets `url(#id)` resolve inside shadow roots too.
   */
  mount?: Element;
  /** Device pixel ratio for the maps. Default: `window.devicePixelRatio`, tracked for changes. */
  dpr?: number;
  /**
   * Pixel budget for one map. When width × height × dpr² exceeds it, the map is generated at a
   * lower ratio and stretched by the filter (the displacement field is smooth, the rim keeps its
   * CSS-px width). Default 320 000 (about 565×565 device px); `Infinity` disables the cap.
   */
  maxMapPixels?: number;
  /**
   * Geometric grid the map size is rounded up to (1.02 = 2 % steps; sizes up to 64 px are exact),
   * so a resize burst reuses maps from the registry instead of regenerating one per pixel of
   * width. The filter stretches the map to the exact box (at most 2 % per axis). `1` disables.
   */
  sizeBucket?: number;
  /** Gaussian width of the rim light, CSS px. Default 2. */
  rimPx?: number;
  /**
   * Extra filter region around the element box, CSS px, so displaced samples can come from just
   * outside it (useful with concave profiles). The output is still clipped to the box. Default 0.
   */
  regionPadding?: number;
  /**
   * Multiplier in [0, 1] on the displacement scale and the rim strength (graph attributes only,
   * never a map regeneration). The appear animation ramps it from 0 to 1. Default 1.
   */
  intensity?: number;
  /**
   * Content-side mode: build the graph for `filter: url()` on an element that owns the pixels
   * (renders in Chromium, WebKit and Gecko), with the lens (`width` × `height`) placed at this
   * offset inside that element's border box. Move it with `setLens` (attribute writes only).
   * Default: the backdrop graph for `backdrop-filter: url()`.
   */
  lens?: LensPlacement;
  /**
   * Give the `<filter>` a fresh id on every re-render. Safari before 27.0 did not repaint a
   * `filter: url(#id)` whose primitives changed (fixed in Safari 27.0); `attachLiquidGlass` turns this on
   * there. Read the current id from `handle.id` / `handle.url` after each render. Default false.
   */
  bumpFilterId?: boolean;
  /** Pixel buffer → URL. Default: PNG blob URL via canvas. Seam for tests and workers. */
  encodeImage?: ImageEncoder;
  /** Releases URLs from `encodeImage`. Default: `URL.revokeObjectURL` for blob URLs. */
  revokeImage?: UrlRevoker;
  /**
   * Registry that shares identical maps between handles. Default: the page-wide registry when
   * the default encoder is used, otherwise a private one (a custom encoder's URLs are its own).
   */
  registry?: MapRegistry<LensMapUrls>;
  /** Element factory. Default: `host.ownerDocument`. */
  document?: ElementFactory;
  /** Called after every completed render. */
  onRender?: (handle: GlassFilterHandle) => void;
}

export interface GlassFilterDebug {
  /** The displacement map: R,G inward displacement, B neutral. */
  mapUrl: string | null;
  /** The light map: R,G rim Gaussian × outward normal, B shade. */
  lightUrl: string | null;
  /** Ratio the current map was generated at (≤ dpr once the pixel budget bites). */
  mapDpr: number;
  /** Device-pixel size of the current map (bucketed CSS size × mapDpr). */
  mapWidth: number;
  mapHeight: number;
  /** Largest |displacement| the optics produced before normalization, px. */
  physicalMaxDisplacementPx: number;
  /** The `scale` the displacement primitive currently uses (physical or artist). */
  displacementPx: number;
  /** Completed renders so far. */
  renders: number;
}

/** Where the lens sits inside the filtered element's border box, CSS px (content-side mode). */
export interface LensPlacement {
  x: number;
  y: number;
}

export interface GlassFilterHandle {
  /** Current filter id (changes per render with `bumpFilterId`). */
  readonly id: string;
  /** `url(#id)`: drop into `backdrop-filter` or `filter`. */
  readonly url: string;
  /** Lens offset in content-side mode, null in backdrop mode. */
  readonly lens: LensPlacement | null;
  readonly filterElement: SVGFilterElement;
  readonly svgElement: SVGSVGElement;
  /** Current parameters after validation and clamping. */
  readonly params: ResolvedGlassParams;
  readonly dpr: number;
  /** Current intensity multiplier, 0..1 (see `setIntensity`). */
  readonly intensity: number;
  readonly destroyed: boolean;
  /** Resolves after the first render has been applied to the DOM. */
  readonly ready: Promise<void>;
  readonly debug: Readonly<GlassFilterDebug>;
  /**
   * Merge a patch and re-render. Calls in the same tick are coalesced; if a render is in
   * flight the newest parameters win. Resolves once the DOM reflects this patch.
   */
  update(patch: Partial<GlassParams>): Promise<void>;
  /** Re-render with the current parameters (cheap when nothing changed). */
  refresh(): Promise<void>;
  /** Change the device pixel ratio the maps are generated at. */
  setDpr(dpr: number): Promise<void>;
  /** Scale displacement and rim by k in [0, 1] without touching the map (cheap per frame). */
  setIntensity(k: number): Promise<void>;
  /**
   * Move the lens (content-side mode): rewrites the subregion attributes only. Calling it on a
   * backdrop-mode handle switches the graph to content-side mode.
   */
  setLens(placement: LensPlacement): Promise<void>;
  /** Revoke URLs, remove the `<svg>`, stop observers. Idempotent. */
  destroy(): void;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** hyalite's budget: about 565×565 device px per map. */
export const DEFAULT_MAX_MAP_PIXELS = 320_000;

/** The ratio to generate a width×height map at under a pixel budget (never above `dpr`). */
export function budgetedDpr(width: number, height: number, dpr: number, maxMapPixels: number): number {
  const area = Math.max(1, width * height);
  if (!(maxMapPixels > 0) || !Number.isFinite(maxMapPixels)) return dpr;
  return Math.max(0.1, Math.min(dpr, Math.sqrt(maxMapPixels / area)));
}

/** hyalite's grid: sizes above 64 px round up to the next power of 1.02. */
export const DEFAULT_SIZE_BUCKET = 1.02;
export const SIZE_BUCKET_MIN = 64;

/** Round a CSS size up to its bucket on a geometric grid (exact below `SIZE_BUCKET_MIN` or when ratio ≤ 1). */
export function bucketSize(value: number, ratio: number = DEFAULT_SIZE_BUCKET): number {
  if (!(ratio > 1) || !(value > SIZE_BUCKET_MIN)) return value;
  const step = Math.ceil(Math.log(value) / Math.log(ratio) - 1e-9);
  return Math.max(value, Math.pow(ratio, step));
}

let idCounter = 0;
/** Unique-per-page filter id (`lg-1`, `lg-2`, …). */
export function nextGlassId(prefix = 'lg'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Split an options bag into GlassParams keys and everything else. Undefined values are dropped. */
export function splitGlassOptions<T extends Partial<GlassParams>>(
  options: T,
): { params: Partial<GlassParams>; rest: Omit<T, keyof GlassParams> } {
  const params: Partial<GlassParams> = {};
  const rest = { ...options } as Record<string, unknown>;
  for (const k of GLASS_PARAM_KEYS) {
    if (options[k] !== undefined) (params as Record<string, unknown>)[k] = options[k];
    delete rest[k];
  }
  return { params, rest: rest as Omit<T, keyof GlassParams> };
}

const defaultDpr = (): number => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

type Waiter = { resolve: () => void; reject: (e: unknown) => void };

/**
 * Create an SVG filter that renders the glass effect for the given parameters, mounted next to
 * `host`. Returns a handle; apply `handle.url` with `backdrop-filter` yourself, or use
 * `attachLiquidGlass` to have that done for you.
 */
export function createGlassFilter(host: Element, options: GlassFilterOptions = {}): GlassFilterHandle {
  const doc: ElementFactory = options.document ?? (host.ownerDocument as unknown as ElementFactory);
  const id = options.id ?? nextGlassId();
  const encode = options.encodeImage ?? encodeImageToBlobUrl;
  const revoke = options.revokeImage ?? revokeBlobUrl;
  const mount = options.mount ?? host;
  const fixedDpr = options.dpr !== undefined;
  const rimPx = options.rimPx;
  const regionPadding = options.regionPadding ?? 0;
  const maxMapPixels = options.maxMapPixels ?? DEFAULT_MAX_MAP_PIXELS;
  const sizeBucket = options.sizeBucket ?? DEFAULT_SIZE_BUCKET;
  const bumpFilterId = options.bumpFilterId ?? false;
  let dpr = options.dpr ?? defaultDpr();
  let intensity = clamp01(options.intensity ?? 1);
  let lens: LensPlacement | null = options.lens ? { x: options.lens.x, y: options.lens.y } : null;
  let currentId = id;
  let idSerial = 0;

  const { params: initial } = splitGlassOptions(options);
  let raw: GlassParams = { ...DEFAULT_GLASS_PARAMS, ...initial };
  let params = resolveGlassParams(raw);

  const { svg, filter } = createFilterSvg(doc, id);
  mount.appendChild(svg);

  const revokeBoth = (urls: LensMapUrls) => {
    revoke(urls.map);
    revoke(urls.light);
  };
  const registry: MapRegistry<LensMapUrls> =
    options.registry ?? (options.encodeImage || options.revokeImage ? new MapRegistry<LensMapUrls>(revokeBoth) : defaultMapRegistry);
  const mapSlot = new UrlSlot<LensMapUrls>(registry);
  let spec: FilterSpec | null = null;
  let destroyed = false;
  const debug: GlassFilterDebug = { mapUrl: null, lightUrl: null, mapDpr: dpr, mapWidth: 0, mapHeight: 0, physicalMaxDisplacementPx: 0, displacementPx: 0, renders: 0 };

  // ---- render scheduling: coalesce per microtask, newest params win, each waiter resolves
  //      after a render that started at or after its request.
  let waiters: Waiter[] = [];
  let scheduled = false;
  let running = false;
  let dirty = false;

  function request(): Promise<void> {
    if (destroyed) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      waiters.push({ resolve, reject });
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(tick);
      }
    });
  }

  async function tick(): Promise<void> {
    scheduled = false;
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    try {
      do {
        dirty = false;
        const batch = waiters;
        waiters = [];
        try {
          await renderOnce();
          for (const w of batch) w.resolve();
        } catch (e) {
          for (const w of batch) w.reject(e);
        }
      } while (!destroyed && (dirty || waiters.length > 0));
    } finally {
      running = false;
    }
  }

  async function renderOnce(): Promise<void> {
    const p = params;
    // The map is generated for the bucketed size and stretched to the exact box by the filter.
    const mw = bucketSize(p.width, sizeBucket);
    const mh = bucketSize(p.height, sizeBucket);
    const d = budgetedDpr(mw, mh, dpr, maxMapPixels);

    // The light direction is not in the key: the light map is direction-free and the rim stage
    // applies the angle as attributes.
    const mapKey = JSON.stringify([mw, mh, p.radius, p.bezelWidth, p.surface, p.refractiveIndex, p.glassThickness, rimPx ?? null, d]);
    if (mapSlot.key !== mapKey) {
      const curve = displacementCurve({
        glassThickness: p.glassThickness,
        bezelWidth: p.bezelWidth,
        refractiveIndex: p.refractiveIndex,
        surface: p.surface,
      });
      const physical = maxAbs(curve);
      // The pixel work runs only if no other handle already holds this exact pair of maps.
      await mapSlot.acquire(mapKey, async () => {
        const images = lensMaps({
          width: mw,
          height: mh,
          radius: p.radius,
          bezelWidth: p.bezelWidth,
          dpr: d,
          curve,
          maxDisplacement: physical,
          rimPx,
        });
        const [map, light] = await Promise.all([encode(images.map), encode(images.light)]);
        return { map, light };
      });
      if (destroyed) return;
      debug.physicalMaxDisplacementPx = physical;
      debug.mapDpr = d;
      debug.mapWidth = Math.round(mw * d);
      debug.mapHeight = Math.round(mh * d);
    }

    const scale = (p.physicalScale ? debug.physicalMaxDisplacementPx : p.displacementScale) * intensity;
    // A fresh id per re-render where the engine will not repaint a changed filter otherwise.
    if (bumpFilterId && spec !== null) currentId = `${id}-r${++idSerial}`;
    const next = buildFilterSpec(
      {
        ...p,
        displacementScale: scale,
        specularStrength: p.specularStrength * intensity,
        shade: p.shade * intensity,
        // a px fringe must shrink with the entrance too; a relative one follows the scale already
        dispersion: p.dispersionUnit === 'px' ? p.dispersion * intensity : p.dispersion,
      },
      { id: currentId, mapHref: mapSlot.url!.map, lightHref: mapSlot.url!.light },
      lens ? { region: { x: lens.x, y: lens.y, width: p.width, height: p.height } } : { padding: regionPadding },
    );
    applyFilterSpec(doc, filter, spec, next);
    spec = next;
    debug.mapUrl = mapSlot.url?.map ?? null;
    debug.lightUrl = mapSlot.url?.light ?? null;
    debug.displacementPx = scale;
    debug.renders += 1;
    options.onRender?.(handle);
  }

  // ---- DPR tracking (browser only, unless a fixed dpr was given)
  let mql: MediaQueryList | null = null;
  const canWatchDpr = !fixedDpr && typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const onDprChange = () => {
    const next = defaultDpr();
    if (next !== dpr) {
      dpr = next;
      void request();
    }
    watchDpr();
  };
  function watchDpr(): void {
    unwatchDpr();
    if (!canWatchDpr) return;
    mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
    mql.addEventListener('change', onDprChange);
  }
  function unwatchDpr(): void {
    mql?.removeEventListener('change', onDprChange);
    mql = null;
  }
  watchDpr();

  // ---- public surface
  function update(patch: Partial<GlassParams>): Promise<void> {
    if (destroyed) return Promise.resolve();
    let changed = false;
    const next: GlassParams = { ...raw };
    for (const k of GLASS_PARAM_KEYS) {
      const v = patch[k];
      if (v !== undefined && v !== next[k]) {
        (next as unknown as Record<string, unknown>)[k] = v;
        changed = true;
      }
    }
    if (!changed && spec !== null && !running && !scheduled) return Promise.resolve();
    if (changed) {
      raw = next;
      params = resolveGlassParams(raw);
    }
    return request();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    unwatchDpr();
    mapSlot.dispose();
    svg.remove();
    const pending = waiters;
    waiters = [];
    for (const w of pending) w.resolve();
  }

  const ready = request();

  const handle: GlassFilterHandle = {
    get id() {
      return currentId;
    },
    get url() {
      return `url(#${currentId})`;
    },
    get lens() {
      return lens;
    },
    filterElement: filter,
    svgElement: svg,
    get params() {
      return params;
    },
    get dpr() {
      return dpr;
    },
    get intensity() {
      return intensity;
    },
    get destroyed() {
      return destroyed;
    },
    ready,
    debug,
    update,
    refresh: () => request(),
    setDpr(next: number) {
      if (!Number.isFinite(next) || next <= 0 || next === dpr) return request();
      dpr = next;
      return request();
    },
    setIntensity(k: number) {
      const next = clamp01(k);
      if (next === intensity) return spec ? Promise.resolve() : request();
      intensity = next;
      return request();
    },
    setLens(placement: LensPlacement) {
      if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return Promise.resolve();
      if (lens && lens.x === placement.x && lens.y === placement.y) return spec ? Promise.resolve() : request();
      lens = { x: placement.x, y: placement.y };
      return request();
    },
    destroy,
  };
  return handle;
}
