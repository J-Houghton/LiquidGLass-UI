import {
  DEFAULT_GLASS_PARAMS,
  GLASS_PARAM_KEYS,
  resolveGlassParams,
  type GlassParams,
  type ResolvedGlassParams,
} from '../core/params.js';
import { displacementCurve } from '../core/optics/disp1d.js';
import { displacementMap, maxAbs } from '../core/optics/disp2d.js';
import { specularMap } from '../core/optics/specularLight.js';
import { buildFilterSpec, TRANSPARENT_PIXEL, type FilterSpec } from '../core/filters/spec.js';
import { createFilterSvg, applyFilterSpec, type ElementFactory } from './mountFilter.js';
import { encodeImageToBlobUrl, revokeBlobUrl, type ImageEncoder, type UrlRevoker } from './encodeImage.js';
import { UrlSlot } from './mapCache.js';

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
  /** Pixel buffer → URL. Default: PNG blob URL via canvas. Seam for tests and workers. */
  encodeImage?: ImageEncoder;
  /** Releases URLs from `encodeImage`. Default: `URL.revokeObjectURL` for blob URLs. */
  revokeImage?: UrlRevoker;
  /** Element factory. Default: `host.ownerDocument`. */
  document?: ElementFactory;
  /** Called after every completed render. */
  onRender?: (handle: GlassFilterHandle) => void;
}

export interface GlassFilterDebug {
  displacementMapUrl: string | null;
  specularMapUrl: string | null;
  /** Largest |displacement| the optics produced before normalization, px (OQ-10). */
  physicalMaxDisplacementPx: number;
  /** Completed renders so far. */
  renders: number;
}

export interface GlassFilterHandle {
  readonly id: string;
  /** `url(#id)`: drop into `backdrop-filter` or `filter`. */
  readonly url: string;
  readonly filterElement: SVGFilterElement;
  readonly svgElement: SVGSVGElement;
  /** Current parameters after validation and clamping. */
  readonly params: ResolvedGlassParams;
  readonly dpr: number;
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
  /** Revoke URLs, remove the `<svg>`, stop observers. Idempotent. */
  destroy(): void;
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
  let dpr = options.dpr ?? defaultDpr();

  const { params: initial } = splitGlassOptions(options);
  let raw: GlassParams = { ...DEFAULT_GLASS_PARAMS, ...initial };
  let params = resolveGlassParams(raw);

  const { svg, filter } = createFilterSvg(doc, id);
  mount.appendChild(svg);

  const dispSlot = new UrlSlot(revoke);
  const specSlot = new UrlSlot(revoke);
  let spec: FilterSpec | null = null;
  let destroyed = false;
  const debug: GlassFilterDebug = { displacementMapUrl: null, specularMapUrl: null, physicalMaxDisplacementPx: 0, renders: 0 };

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
    const d = dpr;

    const dispKey = JSON.stringify([p.width, p.height, p.radius, p.bezelWidth, p.surface, p.refractiveIndex, p.glassThickness, p.chromaticBezelFraction, d]);
    if (dispSlot.key !== dispKey) {
      const curve = displacementCurve({
        glassThickness: p.glassThickness,
        bezelWidth: p.bezelWidth,
        refractiveIndex: p.refractiveIndex,
        surface: p.surface,
      });
      debug.physicalMaxDisplacementPx = maxAbs(curve);
      const img = displacementMap({
        width: p.width,
        height: p.height,
        radius: p.radius,
        bezelWidth: p.bezelWidth,
        dpr: d,
        curve,
        chromaticBezelFraction: p.chromaticBezelFraction,
      });
      const url = await encode(img);
      if (destroyed) {
        revoke(url);
        return;
      }
      dispSlot.set(dispKey, url);
    }

    const specKey = JSON.stringify([p.width, p.height, p.radius, p.bezelWidth, p.specular, p.specularAngleDeg, p.specularStrength, d]);
    if (specSlot.key !== specKey) {
      let url: string | null = null;
      if (p.specular) {
        const img = specularMap({
          width: p.width,
          height: p.height,
          radius: p.radius,
          bezelWidth: p.bezelWidth,
          dpr: d,
          angleDeg: p.specularAngleDeg,
          strength: p.specularStrength,
        });
        url = await encode(img);
        if (destroyed) {
          revoke(url);
          return;
        }
      }
      specSlot.set(specKey, url);
    }

    const next = buildFilterSpec(p, { id, mapHref: dispSlot.url!, specularHref: specSlot.url ?? TRANSPARENT_PIXEL });
    applyFilterSpec(doc, filter, spec, next);
    spec = next;
    debug.displacementMapUrl = dispSlot.url;
    debug.specularMapUrl = specSlot.url;
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
    dispSlot.dispose();
    specSlot.dispose();
    svg.remove();
    const pending = waiters;
    waiters = [];
    for (const w of pending) w.resolve();
  }

  const ready = request();

  const handle: GlassFilterHandle = {
    id,
    url: `url(#${id})`,
    filterElement: filter,
    svgElement: svg,
    get params() {
      return params;
    },
    get dpr() {
      return dpr;
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
    destroy,
  };
  return handle;
}
