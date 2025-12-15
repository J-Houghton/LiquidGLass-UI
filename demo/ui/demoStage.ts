import type { LiquidGlassContainer } from '../../src/components/liquid-glass-container.js';
import {
  CONTAINERS_CHANGED_EVENT,
  DEFAULT_GLASS_CONTAINER_PARAMS,
  REMOVE_CONTAINER_EVENT,
  SELECT_CONTAINER_EVENT,
  type GlassContainerParams,
} from '../../src/core/defaults.js';
import { PRESETS, BACKGROUNDS, type Preset } from './presets.js';

type StageEntry = {
  id: string;
  wrapper: HTMLDivElement;
  container: LiquidGlassContainer;
};

// Simplified event types
type StageContainersChangedDetail = { containers: string[]; activeId?: string; };

const REMOVE_REQUEST_EVENT = REMOVE_CONTAINER_EVENT;
const SELECT_EVENT = SELECT_CONTAINER_EVENT;

export class DemoStageController {
  private readonly stage: HTMLElement;
  private readonly containers = new Map<string, StageEntry>();
  private activeId: string | undefined;
  private idCounter = 0;
  
  // Ghost preview
  private ghostWrapper: HTMLDivElement | null = null;
  private ghostContainer: LiquidGlassContainer | null = null;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    this.handleRemoveRequest = this.handleRemoveRequest.bind(this);
    this.handleSelectionRequest = this.handleSelectionRequest.bind(this);
  }

  init() {
    window.addEventListener(REMOVE_REQUEST_EVENT, this.handleRemoveRequest);
    window.addEventListener(SELECT_EVENT, this.handleSelectionRequest);

    // Initial Setup
    this.setupUI();

    // Default Container
    // We don't auto-create one if the user wants a clean slate, 
    // but for a demo, a default one is nice.
    if (!this.containers.size) {
      this.addPresetToStage(PRESETS[0]);
    }
    
    // Default BG
    this.setBackground(BACKGROUNDS[0]);
  }

  // --- External API for UI ---

  public addPresetToStage(preset: Preset) {
    const config = { ...DEFAULT_GLASS_CONTAINER_PARAMS, ...preset.config };
    // Randomize position slightly
    const entry = this.createContainer(config);
    this.centerInScreen(entry, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
    this.setActiveId(entry.id);
    this.emitChange(entry.id);
  }

  public setBackground(bg: { id: string; type: string; value: string }) {
    document.body.className = ''; // Clear existing
    document.body.style.backgroundImage = '';

    if (bg.type === 'css') {
      document.body.classList.add('show-grid');
      document.documentElement.style.removeProperty('--active-bg');
    } else {
      document.documentElement.style.setProperty('--active-bg', `url('${bg.value}')`);
    }
  }

  public showPreview(preset: Preset) {
    if (!this.ghostWrapper) {
      this.ghostWrapper = document.createElement('div');
      this.ghostWrapper.className = 'preview-ghost';
      this.ghostContainer = document.createElement('liquid-glass-container') as LiquidGlassContainer;
      this.ghostWrapper.appendChild(this.ghostContainer);
      document.body.appendChild(this.ghostWrapper);
    }
    
    if (this.ghostContainer) {
      const config = { ...DEFAULT_GLASS_CONTAINER_PARAMS, ...preset.config };
      this.applyConfig(this.ghostContainer, config);
      this.ghostContainer.requestUpdate();
    }

    // Position ghost in center of screen
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = this.ghostContainer?.width || 300;
    const h = this.ghostContainer?.height || 200;
    
    this.ghostWrapper.style.left = `${(vw - w) / 2}px`;
    this.ghostWrapper.style.top = `${(vh - h) / 2}px`;
    this.ghostWrapper.style.opacity = '1';
  }

  public hidePreview() {
    if (this.ghostWrapper) {
      this.ghostWrapper.style.opacity = '0';
    }
  }

  // --- Internal Logic ---

  private setupUI() {
    // Render Presets
    const presetList = document.getElementById('presetList');
    if (presetList) {
      presetList.innerHTML = '';
      PRESETS.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.innerHTML = `<span class="preset-name">${p.name}</span><span class="preset-desc">${p.description}</span>`;
        btn.onclick = () => this.addPresetToStage(p);
        btn.onmouseenter = () => this.showPreview(p);
        btn.onmouseleave = () => this.hidePreview();
        presetList.appendChild(btn);
      });
    }

    // Render Backgrounds
    const bgList = document.getElementById('bgList');
    if (bgList) {
      bgList.innerHTML = '';
      BACKGROUNDS.forEach(bg => {
        const thumb = document.createElement('div');
        thumb.className = 'bg-thumb';
        if (bg.type === 'img') {
          thumb.style.backgroundImage = `url(${bg.value})`;
        } else {
          thumb.style.background = 'linear-gradient(135deg, #eee, #ccc)';
          thumb.innerHTML = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:bold;color:#333;">GRID</span>';
        }
        thumb.onclick = () => {
          // visual selection state
          Array.from(bgList.children).forEach(c => c.classList.remove('active'));
          thumb.classList.add('active');
          this.setBackground(bg);
        };
        bgList.appendChild(thumb);
      });

      // Upload Button
      const label = document.createElement('label');
      label.className = 'bg-thumb file-upload-label';
      label.innerHTML = '+';
      label.title = 'Upload Image';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          this.setBackground({ id: 'custom', type: 'img', value: url });
        }
      };
      label.appendChild(input);
      bgList.appendChild(label);
    }
  }

  private createContainer(config: GlassContainerParams): StageEntry {
    const container = document.createElement('liquid-glass-container') as LiquidGlassContainer;
    this.applyConfig(container, config);

    this.idCounter += 1;
    const id = `demo-container-${this.idCounter}`;
    container.id = id;
    container.setAttribute('aria-label', `Glass surface ${this.idCounter}`);

    const wrapper = document.createElement('div');
    wrapper.className = 'demo-stage__draggable';
    wrapper.dataset.containerId = id;
    // Default off-screen or 0,0, will be moved immediately
    wrapper.style.left = '0px'; 
    wrapper.style.top = '0px';
    wrapper.tabIndex = 0;
    wrapper.append(container);
    document.body.append(wrapper);

    this.makeDraggable(wrapper, id);
    const entry: StageEntry = { id, wrapper, container };
    this.containers.set(id, entry);
    return entry;
  }

  private centerInScreen(entry: StageEntry, offsetX = 0, offsetY = 0) {
     const vw = window.innerWidth;
     const vh = window.innerHeight;
     const x = (vw - entry.container.width) / 2 + offsetX;
     const y = (vh - entry.container.height) / 2 + offsetY;
     this.positionWrapper(entry.wrapper, x, y);
  }

  private applyConfig(container: LiquidGlassContainer, config: GlassContainerParams) {
    container.width = config.width;
    container.height = config.height;
    container.radius = config.radius;
    container.bezelWidth = config.bezelWidth;
    container.glassThickness = config.glassThickness;
    container.surface = config.surface;
    container.refractiveIndex = config.refractiveIndex;
    container.scalePx = config.scalePx;
    container.blurKind = config.blurKind;
    container.blurStdDev = config.blurStdDev;
    container.showSpecular = config.showSpecular;
    container.specularAngleDeg = config.specularAngleDeg;
    container.specularStrength = config.specularStrength;
    container.dispersion = config.dispersion;
    container.chromaticBezelFactor = config.chromaticBezelFactor;
    container.frost = config.frost;
    container.saturation = config.saturation;
  }

  private positionWrapper(wrapper: HTMLDivElement, left: number, top: number) {
    wrapper.style.left = `${left}px`;
    wrapper.style.top = `${top}px`;
  }

  private makeDraggable(wrapper: HTMLDivElement, id: string) {
    let pointerId: number | null = null;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || pointerId !== null) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = parseFloat(wrapper.style.left || '0');
      startTop = parseFloat(wrapper.style.top || '0');
      wrapper.setPointerCapture(pointerId);
      wrapper.classList.add('is-dragging');
      wrapper.focus({ preventScroll: true });
      if (this.setActiveId(id)) {
        this.emitChange(this.activeId);
      }
      event.preventDefault();
      // Hide ghost if dragging starts to avoid confusion
      this.hidePreview();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      this.positionWrapper(wrapper, startLeft + dx, startTop + dy);
    };

    const endDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      wrapper.releasePointerCapture(pointerId);
      pointerId = null;
      wrapper.classList.remove('is-dragging');
    };

    wrapper.addEventListener('pointerdown', onPointerDown);
    wrapper.addEventListener('pointermove', onPointerMove);
    wrapper.addEventListener('pointerup', endDrag);
    wrapper.addEventListener('pointercancel', endDrag);
  }

  private handleRemoveRequest(event: WindowEventMap[typeof REMOVE_REQUEST_EVENT]) {
    const id = event.detail?.id;
    if (!id) return;
    const entry = this.containers.get(id);
    if (!entry) return;
    entry.wrapper.remove();
    this.containers.delete(id);

    if (this.activeId === id) {
      const next = this.containers.keys().next();
      this.setActiveId(next.done ? undefined : next.value);
    }
    this.emitChange(this.activeId);
  }

  private handleSelectionRequest(event: WindowEventMap[typeof SELECT_EVENT]) {
    const id = event.detail?.id;
    if (!id || !this.containers.has(id)) return;
    if (this.setActiveId(id)) {
      this.emitChange(id);
    }
  }

  private setActiveId(id: string | undefined) {
    if (this.activeId === id) return false;
    this.activeId = id;
    
    // Bring to front
    if (id) {
        const entry = this.containers.get(id);
        if (entry) {
            // Simple z-index bump, simpler than full management for a demo
            entry.wrapper.style.zIndex = '101';
            this.containers.forEach((e, k) => {
                if (k !== id) e.wrapper.style.zIndex = '100';
            });
        }
    }
    return true;
  }

  private emitChange(activeId: string | undefined) {
    const detail: StageContainersChangedDetail = {
      containers: Array.from(this.containers.keys()),
      activeId,
    };
    window.dispatchEvent(new CustomEvent(CONTAINERS_CHANGED_EVENT, { detail }));
  }
}

// Global Singleton Init
let controller: DemoStageController | null = null;
function init() {
  const stage = document.querySelector<HTMLElement>('[data-demo-stage]');
  if (!stage) return;
  controller = new DemoStageController(stage);
  controller.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}