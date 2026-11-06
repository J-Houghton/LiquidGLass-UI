import {
  attachLiquidGlass,
  resolveGlassParams,
  DEFAULT_GLASS_PARAMS,
  type GlassParams,
  type LiquidGlassHandle,
} from '../../src/index.js';
import { CONTAINERS_CHANGED_EVENT, REMOVE_CONTAINER_EVENT, SELECT_CONTAINER_EVENT } from './events.js';
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
};

/** Registry read by the config pane. */
export const stage = {
  entries: new Map<string, StageEntry>(),
  activeId: undefined as string | undefined,
};

function createGlass(config: GlassParams, parent: HTMLElement, id: string, caption: string, appear = APPEAR_MS): Glass {
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

  const handle = attachLiquidGlass(el, {
    ...config,
    id: `${id}-filter`,
    radius: config.radius,
    appear,
    onRender: (h) => {
      const url = h.debug.mapUrl;
      debugEl.style.backgroundImage = url ? `url(${url})` : '';
    },
  });
  showRenderMode(handle);
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
  return Promise.all(tasks).then(() => undefined);
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
  if (!override) return;

  const base = entry.handle.params;
  const config = resolveGlassParams({ ...base, ...override }, DEFAULT_GLASS_PARAMS);
  const twin = createGlass(config, entry.wrapper, `${entry.id}-twin`, captionFor(config, 'B'), 0);
  twin.debugEl.hidden = !entry.debug;
  entry.twin = { ...twin, override };
  entry.wrapper.classList.add('has-twin');
  entry.captionEl.textContent = captionFor(base, 'A');
}

/** Re-run the entrance on the primary and its twin together, so the two can be compared mid-flight. */
export function replayAppear(entry: StageEntry, durationMs = APPEAR_MS): Promise<void> {
  const tasks = [entry.handle.appear(durationMs)];
  if (entry.twin) tasks.push(entry.twin.handle.appear(durationMs));
  return Promise.all(tasks).then(() => undefined);
}

/** Toolbar badge: which path this browser got (SVG lens in Chromium, CSS frost elsewhere). */
function showRenderMode(handle: LiquidGlassHandle): void {
  const badge = document.getElementById('modeBadge');
  if (!badge) return;
  badge.textContent = handle.mode === 'glass' ? 'SVG lens' : 'CSS frost fallback';
  badge.dataset.mode = handle.mode;
  badge.title =
    handle.mode === 'glass'
      ? 'backdrop-filter: url(#svg) renders in this engine'
      : `detectGlassSupport() = "${handle.support}": this engine does not render SVG backdrop filters, so you see the CSS fallback`;
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
    if (!stage.entries.size) this.addPresetToStage(PRESETS[0]);
    this.setBackground(BACKGROUNDS[0]);
  }

  // --- External API for UI ---

  public addPresetToStage(preset: Preset) {
    const config = resolveGlassParams(preset.config, DEFAULT_GLASS_PARAMS);
    const entry = this.createEntry(config);
    this.centerInScreen(entry, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
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
    const entry: StageEntry = { id, label, wrapper, ...glass, debug: false, twin: null };
    stage.entries.set(id, entry);
    return entry;
  }

  private centerInScreen(entry: StageEntry, offsetX = 0, offsetY = 0) {
    const { width, height } = entry.handle.params;
    const x = (window.innerWidth - width) / 2 + offsetX;
    const y = (window.innerHeight - height) / 2 + offsetY;
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
