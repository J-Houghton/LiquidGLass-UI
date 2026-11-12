import {
  attachLiquidGlass,
  attachGlassMotion,
  attachGlassLight,
  resolveGlassParams,
  DEFAULT_GLASS_PARAMS,
  GLASS_PARAM_KEYS,
  type GlassParams,
  type GlassLightHandle,
  type GlassMotionHandle,
  type LiquidGlassHandle,
} from '../../src/index.js';
import { CONFIG_CHANGED_EVENT, CONTAINERS_CHANGED_EVENT, REMOVE_CONTAINER_EVENT, SELECT_CONTAINER_EVENT } from './events.js';
import { PRESETS, BACKGROUNDS, type Preset } from './presets.js';

/** Entrance duration used when a preset is dropped on the stage (replayable from the pane). */
export const APPEAR_MS = 400;

type Glass = { el: HTMLDivElement; debugEl: HTMLDivElement; captionEl: HTMLDivElement; handle: LiquidGlassHandle };

/**
 * One glass surface on the stage, optionally with an A/B twin: a second glass in the same
 * draggable wrapper that mirrors every parameter of the primary except `twin.override`.
 */
export type StageEntry = Glass & {
  id: string;
  label: string;
  wrapper: HTMLDivElement;
  debug: boolean;
  twin: (Glass & { override: Partial<GlassParams> }) | null;
  /** One motion handle per glass in the wrapper (primary, twin), all driven by the wrapper's pointer. */
  motion: GlassMotionHandle[];
  motionSettings: MotionSettings | null;
  /** One light handle per glass in the wrapper. */
  light: GlassLightHandle[];
  lightSettings: LightSettings | null;
  /** Options that are fixed when the glass is attached; changing them re-attaches it. */
  attach: AttachSettings;
};

/** Attach-time options the playground exposes. */
export interface AttachSettings {
  /** Draw shade and rim on a layer over the glass instead of inside the lens. */
  lightLayer: boolean;
  /** 'auto' detects; 'frost' previews the CSS fallback Safari and Firefox get. */
  path: 'auto' | 'frost';
}

export const DEFAULT_ATTACH: AttachSettings = { lightLayer: false, path: 'auto' };

/** Tell the code panel (and anyone else) that the active glass's configuration changed. */
export function notifyConfigChanged(): void {
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
}

/** The playground's view of the light options. */
export interface LightSettings {
  /** Scene light above the viewport: the rim follows where the glass sits. */
  scene: boolean;
  /** The pointer takes the light over when it comes within `radius` px. */
  pointer: boolean;
  radius: number;
  /** Seconds the light takes to glide to a new direction (its spring's duration). */
  glide: number;
}

export const DEFAULT_LIGHT: LightSettings = { scene: true, pointer: true, radius: 160, glide: 0.7 };

/** (Re)attach the page-driven light for an entry and its twin. `null` detaches (the Angle slider rules again). */
export function setLight(entry: StageEntry, settings: LightSettings | null): void {
  for (const l of entry.light) l.destroy();
  entry.light = [];
  entry.lightSettings = settings;
  notifyConfigChanged();
  if (!settings || !(settings.scene || settings.pointer)) return;
  const glasses = entry.twin ? [entry, entry.twin] : [entry];
  for (const g of glasses) {
    entry.light.push(
      attachGlassLight(g.handle, {
        scene: settings.scene ? 'viewport' : false,
        pointer: settings.pointer ? { radius: settings.radius } : false,
        spring: { duration: settings.glide, bounce: 0 },
      }),
    );
  }
}

/** The playground's view of the motion options. */
export interface MotionSettings {
  press: boolean;
  drag: boolean;
  hover: boolean;
  /** Press spring, perceptual: seconds and bounce. */
  duration: number;
  bounce: number;
}

export const DEFAULT_MOTION: MotionSettings = { press: true, drag: true, hover: false, duration: 0.35, bounce: 0.3 };

/** (Re)attach the motion for an entry and its twin. `null` detaches. */
export function setMotion(entry: StageEntry, settings: MotionSettings | null): void {
  for (const m of entry.motion) m.destroy();
  entry.motion = [];
  entry.motionSettings = settings;
  notifyConfigChanged();
  if (!settings || !(settings.press || settings.drag || settings.hover)) return;
  const spring = { duration: settings.duration, bounce: settings.bounce };
  const glasses = entry.twin ? [entry, entry.twin] : [entry];
  for (const g of glasses) {
    entry.motion.push(
      attachGlassMotion(g.handle, {
        // the wrapper owns the drag (and the pointer capture), so it is the pointer source
        pointerTarget: entry.wrapper,
        element: g.el,
        press: settings.press ? { spring } : false,
        drag: settings.drag,
        hover: settings.hover ? { spring: { duration: settings.duration, bounce: settings.bounce / 2 } } : false,
      }),
    );
  }
}

/** Registry read by the config pane. */
export const stage = {
  entries: new Map<string, StageEntry>(),
  activeId: undefined as string | undefined,
};

function attachGlass(el: HTMLDivElement, debugEl: HTMLDivElement, config: GlassParams, id: string, appear: number, attach: AttachSettings): LiquidGlassHandle {
  const handle = attachLiquidGlass(el, {
    ...config,
    id: `${id}-filter`,
    radius: config.radius,
    appear,
    lightLayer: attach.lightLayer,
    ...(attach.path === 'frost' ? { support: 'frost' as const } : {}),
    onRender: (h) => {
      const url = h.debug.mapUrl;
      debugEl.style.backgroundImage = url ? `url(${url})` : '';
    },
  });
  showRenderMode(handle);
  return handle;
}

/** The plain parameters of a handle (without the resolver's `shape` and `notes`). */
function paramsOf(handle: LiquidGlassHandle): GlassParams {
  const out = {} as Record<string, unknown>;
  for (const k of GLASS_PARAM_KEYS) out[k] = handle.params[k];
  return out as unknown as GlassParams;
}

/** Change the attach-time options: the glass (and its twin) is destroyed and attached again in place. */
export function setAttach(entry: StageEntry, attach: AttachSettings): void {
  const motion = entry.motionSettings;
  const light = entry.lightSettings;
  setMotion(entry, null);
  setLight(entry, null);
  entry.attach = attach;
  const glasses: Glass[] = entry.twin ? [entry, entry.twin] : [entry];
  glasses.forEach((g, i) => {
    const config = paramsOf(g.handle);
    g.handle.destroy();
    g.handle = attachGlass(g.el, g.debugEl, config, i === 0 ? entry.id : `${entry.id}-twin`, 0, attach);
  });
  setMotion(entry, motion);
  setLight(entry, light);
}

function createGlass(config: GlassParams, parent: HTMLElement, id: string, caption: string, appear = APPEAR_MS, attach: AttachSettings = DEFAULT_ATTACH): Glass {
  const el = document.createElement('div');
  el.className = 'demo-glass';
  el.id = id;
  el.style.width = `${config.width}px`;
  el.style.height = `${config.height}px`;

  const debugEl = document.createElement('div');
  debugEl.className = 'demo-glass__debug';
  debugEl.hidden = true;
  el.appendChild(debugEl);

  const captionEl = document.createElement('div');
  captionEl.className = 'demo-glass__caption';
  captionEl.textContent = caption;
  el.appendChild(captionEl);
  parent.appendChild(el);

  const handle = attachGlass(el, debugEl, config, id, appear, attach);
  return { el, debugEl, captionEl, handle };
}

/** Apply a parameter patch to one glass: size through CSS (the observer follows), the rest through the handle. */
function updateGlass(glass: Pick<Glass, 'el' | 'handle'>, patch: Partial<GlassParams>): Promise<void> {
  const { width, height, ...rest } = patch;
  if (width !== undefined) glass.el.style.width = `${width}px`;
  if (height !== undefined) glass.el.style.height = `${height}px`;
  return glass.handle.update(rest);
}

/** Patch the primary and, if present, its twin (twin keeps its override on top). */
export function updateEntry(entry: StageEntry, patch: Partial<GlassParams>): Promise<void> {
  const tasks = [updateGlass(entry, patch)];
  if (entry.twin) tasks.push(updateGlass(entry.twin, { ...patch, ...entry.twin.override }));
  return Promise.all(tasks).then(() => notifyConfigChanged());
}

export function setGlassDebug(entry: StageEntry, on: boolean): void {
  entry.debug = on;
  entry.debugEl.hidden = !on;
  if (entry.twin) entry.twin.debugEl.hidden = !on;
}

const captionFor = (p: Partial<GlassParams>, prefix: string) =>
  `${prefix} · blur ${p.blurStage ?? DEFAULT_GLASS_PARAMS.blurStage} · shade ${p.shade ?? DEFAULT_GLASS_PARAMS.shade}`;

/**
 * Show (override != null) or remove (null) the A/B twin. The twin copies the primary's current
 * parameters, applies the override, and from then on mirrors every patch sent to the primary.
 */
export function setTwin(entry: StageEntry, override: Partial<GlassParams> | null): void {
  if (entry.twin) {
    entry.twin.handle.destroy();
    entry.twin.el.remove();
    entry.twin = null;
    entry.wrapper.classList.remove('has-twin');
  }
  entry.captionEl.textContent = '';
  if (!override) {
    setMotion(entry, entry.motionSettings);
    setLight(entry, entry.lightSettings);
    return;
  }

  const base = entry.handle.params;
  const config = resolveGlassParams({ ...base, ...override }, DEFAULT_GLASS_PARAMS);
  const twin = createGlass(config, entry.wrapper, `${entry.id}-twin`, captionFor(config, 'B'), 0, entry.attach);
  twin.debugEl.hidden = !entry.debug;
  entry.twin = { ...twin, override };
  entry.wrapper.classList.add('has-twin');
  entry.captionEl.textContent = captionFor(base, 'A');
  setMotion(entry, entry.motionSettings); // the twin moves with the primary
  setLight(entry, entry.lightSettings); // and is lit like it
}

/** Re-run the entrance (lens easing in, glass springing in) on the primary and its twin together. */
export function replayAppear(entry: StageEntry, durationMs = APPEAR_MS): Promise<void> {
  for (const m of entry.motion) m.enter();
  const tasks = [entry.handle.appear(durationMs)];
  if (entry.twin) tasks.push(entry.twin.handle.appear(durationMs));
  return Promise.all(tasks).then(() => undefined);
}

/** Toolbar badge: which path this browser got (SVG lens in Chromium, CSS frost elsewhere). */
function showRenderMode(handle: LiquidGlassHandle): void {
  const badge = document.getElementById('modeBadge');
  if (!badge) return;
  badge.textContent = handle.mode === 'glass' ? 'Refraction on' : handle.mode === 'content' ? 'Refraction on (content)' : 'Frost fallback';
  badge.dataset.mode = handle.mode;
  badge.title =
    handle.mode === 'glass'
      ? 'This browser renders the SVG lens (backdrop-filter: url)'
      : 'Showing the CSS frost fallback: this browser, or the Render path setting, does not use the SVG lens. Chrome and Edge show real refraction.';
}

export class DemoStageController {
  private idCounter = 0;
  private ghostWrapper: HTMLDivElement | null = null;
  private ghost: Glass | null = null;

  constructor() {
    this.handleRemoveRequest = this.handleRemoveRequest.bind(this);
    this.handleSelectionRequest = this.handleSelectionRequest.bind(this);
  }

  init() {
    window.addEventListener(REMOVE_CONTAINER_EVENT, this.handleRemoveRequest);
    window.addEventListener(SELECT_CONTAINER_EVENT, this.handleSelectionRequest);
    this.setupUI();
    // ?preset=<id> opens with that preset (used for links and screenshots)
    const wanted = new URLSearchParams(location.search).get('preset');
    if (!stage.entries.size) this.addPresetToStage(PRESETS.find((p) => p.id === wanted) ?? PRESETS[0], false);
    this.setBackground(BACKGROUNDS[0]);
  }

  // --- External API for UI ---

  public addPresetToStage(preset: Preset, scatter = true) {
    const config = resolveGlassParams(preset.config, DEFAULT_GLASS_PARAMS);
    const entry = this.createEntry(config);
    this.centerInScreen(entry, scatter ? (Math.random() - 0.5) * 40 : 0, scatter ? (Math.random() - 0.5) * 40 : 0);
    this.setActiveId(entry.id);
    this.emitChange(entry.id);
  }

  public setBackground(bg: { id: string; type: string; value: string }) {
    document.body.className = '';
    document.body.style.backgroundImage = '';
    if (bg.type === 'css') {
      document.body.classList.add('show-grid');
      document.documentElement.style.removeProperty('--active-bg');
    } else {
      document.documentElement.style.setProperty('--active-bg', `url('${bg.value}')`);
    }
  }

  public showPreview(preset: Preset, anchor: HTMLElement) {
    const config = resolveGlassParams(preset.config, DEFAULT_GLASS_PARAMS);
    if (!this.ghostWrapper) {
      this.ghostWrapper = document.createElement('div');
      this.ghostWrapper.className = 'preview-ghost';
      document.body.appendChild(this.ghostWrapper);
      this.ghost = createGlass(config, this.ghostWrapper, 'demo-ghost', '', 0);
    } else if (this.ghost) {
      void updateGlass(this.ghost, config);
    }

    const rect = anchor.getBoundingClientRect();
    const ghostW = config.width;
    const ghostH = config.height;
    const gap = 16;
    let left = rect.right + gap;
    let top = rect.top + rect.height / 2 - ghostH / 2;

    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + ghostW > vw - pad) left = vw - ghostW - pad;
    if (top < pad) top = pad;
    if (top + ghostH > vh - pad) top = vh - ghostH - pad;

    this.ghostWrapper.style.left = `${left}px`;
    this.ghostWrapper.style.top = `${top}px`;
    this.ghostWrapper.style.opacity = '1';
  }

  public hidePreview() {
    if (!this.ghostWrapper) return;
    this.ghostWrapper.style.opacity = '0';
    setTimeout(() => {
      if (this.ghostWrapper && this.ghostWrapper.style.opacity === '0') {
        this.ghostWrapper.style.left = '-9999px';
      }
    }, 200);
  }

  // --- Internal Logic ---

  private setupUI() {
    const presetList = document.getElementById('presetList');
    if (presetList) {
      presetList.innerHTML = '';
      PRESETS.forEach((p) => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.type = 'button';
        btn.innerHTML = `<span class="preset-name">${p.name}</span><span class="preset-desc">${p.description}</span>`;
        btn.onclick = () => this.addPresetToStage(p);
        btn.onmouseenter = () => this.showPreview(p, btn);
        btn.onmouseleave = () => this.hidePreview();
        presetList.appendChild(btn);
      });
    }

    const bgList = document.getElementById('bgList');
    if (bgList) {
      bgList.innerHTML = '';
      BACKGROUNDS.forEach((bg) => {
        const thumb = document.createElement('div');
        thumb.className = 'bg-thumb';
        if (bg.type === 'img') {
          thumb.style.backgroundImage = `url(${bg.value})`;
        } else {
          thumb.style.background = 'linear-gradient(135deg, #eee, #ccc)';
          thumb.innerHTML =
            '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:bold;color:#333;">GRID</span>';
        }
        thumb.onclick = () => {
          Array.from(bgList.children).forEach((c) => c.classList.remove('active'));
          thumb.classList.add('active');
          this.setBackground(bg);
        };
        bgList.appendChild(thumb);
      });

      const label = document.createElement('label');
      label.className = 'bg-thumb file-upload-label';
      label.innerHTML = '+';
      label.title = 'Upload Image';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) this.setBackground({ id: 'custom', type: 'img', value: URL.createObjectURL(file) });
      };
      label.appendChild(input);
      bgList.appendChild(label);
    }
  }

  private createEntry(config: GlassParams): StageEntry {
    this.idCounter += 1;
    const id = `demo-container-${this.idCounter}`;
    const label = `Glass surface ${this.idCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'demo-stage__draggable';
    wrapper.dataset.containerId = id;
    wrapper.style.left = '0px';
    wrapper.style.top = '0px';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('aria-label', label);
    document.body.append(wrapper);

    const glass = createGlass(config, wrapper, id, '');
    this.makeDraggable(wrapper, id);
    const entry: StageEntry = { id, label, wrapper, ...glass, debug: false, twin: null, motion: [], motionSettings: null, light: [], lightSettings: null, attach: { ...DEFAULT_ATTACH } };
    setMotion(entry, { ...DEFAULT_MOTION });
    setLight(entry, { ...DEFAULT_LIGHT });
    for (const m of entry.motion) m.enter(); // arrive with a little spring, alongside the lens's appear
    stage.entries.set(id, entry);
    return entry;
  }

  private centerInScreen(entry: StageEntry, offsetX = 0, offsetY = 0) {
    const { width, height } = entry.handle.params;
    // start over the colour swatches, where the refraction is easiest to see
    const anchor = document.querySelector('.swatches')?.getBoundingClientRect();
    const cx = anchor && anchor.width > 0 ? anchor.left + anchor.width / 2 : window.innerWidth / 2;
    const cy = anchor && anchor.width > 0 ? anchor.top + anchor.height / 2 : window.innerHeight / 2;
    const x = cx - width / 2 + offsetX;
    const y = cy - height / 2 + offsetY;
    entry.wrapper.style.left = `${x}px`;
    entry.wrapper.style.top = `${y}px`;
  }

  private makeDraggable(wrapper: HTMLDivElement, id: string) {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    wrapper.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || pointerId !== null) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = parseFloat(wrapper.style.left || '0');
      startTop = parseFloat(wrapper.style.top || '0');
      wrapper.setPointerCapture(pointerId);
      wrapper.classList.add('is-dragging');
      wrapper.focus({ preventScroll: true });
      if (this.setActiveId(id)) this.emitChange(stage.activeId);
      event.preventDefault();
      this.hidePreview();
    });
    wrapper.addEventListener('pointermove', (event) => {
      if (pointerId !== event.pointerId) return;
      wrapper.style.left = `${startLeft + event.clientX - startX}px`;
      wrapper.style.top = `${startTop + event.clientY - startY}px`;
      // the glass moved under a fixed scene light: re-aim the rim
      for (const l of stage.entries.get(id)?.light ?? []) l.update();
    });
    const endDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      wrapper.releasePointerCapture(pointerId);
      pointerId = null;
      wrapper.classList.remove('is-dragging');
    };
    wrapper.addEventListener('pointerup', endDrag);
    wrapper.addEventListener('pointercancel', endDrag);
  }

  private handleRemoveRequest(event: WindowEventMap[typeof REMOVE_CONTAINER_EVENT]) {
    const id = event.detail?.id;
    const entry = id ? stage.entries.get(id) : undefined;
    if (!id || !entry) return;
    setMotion(entry, null);
    setLight(entry, null);
    entry.twin?.handle.destroy();
    entry.handle.destroy();
    entry.wrapper.remove();
    stage.entries.delete(id);
    if (stage.activeId === id) {
      const next = stage.entries.keys().next();
      this.setActiveId(next.done ? undefined : next.value);
    }
    this.emitChange(stage.activeId);
  }

  private handleSelectionRequest(event: WindowEventMap[typeof SELECT_CONTAINER_EVENT]) {
    const id = event.detail?.id;
    if (!id || !stage.entries.has(id)) return;
    if (this.setActiveId(id)) this.emitChange(id);
  }

  private setActiveId(id: string | undefined) {
    if (stage.activeId === id) return false;
    stage.activeId = id;
    if (id) {
      stage.entries.forEach((e, k) => {
        e.wrapper.style.zIndex = k === id ? '101' : '100';
      });
    }
    return true;
  }

  private emitChange(activeId: string | undefined) {
    window.dispatchEvent(
      new CustomEvent(CONTAINERS_CHANGED_EVENT, { detail: { containers: Array.from(stage.entries.keys()), activeId } }),
    );
    notifyConfigChanged();
  }
}

/** Start the stage once the DOM is ready. Called from demo/main.ts. */
export function initDemoStage(): void {
  const start = () => {
    if (!document.querySelector('[data-demo-stage]')) return;
    new DemoStageController().init();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
