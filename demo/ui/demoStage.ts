import type { LiquidGlassContainer } from '../../src/components/liquid-glass-container.js';
import { DEFAULT_GLASS_CONTAINER_PARAMS, type GlassContainerParams } from '../../src/core/defaults.js';
import { CONTAINERS_CHANGED_EVENT, REMOVE_CONTAINER_EVENT, SELECT_CONTAINER_EVENT } from './events.js';
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
  private readonly containers = new Map<string, StageEntry>();
  private activeId: string | undefined;
  private idCounter = 0;
  
  // Ghost preview
  private ghostWrapper: HTMLDivElement | null = null;
  private ghostContainer: LiquidGlassContainer | null = null;

  constructor(_stage: HTMLElement) {
    this.handleRemoveRequest = this.handleRemoveRequest.bind(this);
    this.handleSelectionRequest = this.handleSelectionRequest.bind(this);
  }

  init() {
    window.addEventListener(REMOVE_REQUEST_EVENT, this.handleRemoveRequest);
    window.addEventListener(SELECT_EVENT, this.handleSelectionRequest);

    // Initial Setup
    this.setupUI();

    // Default Container (Preset 0)
    if (!this.containers.size) {
      this.addPresetToStage(PRESETS[0]);
    }
    
    // Default BG
    this.setBackground(BACKGROUNDS[0]);
  }

  // --- External API for UI ---

  public addPresetToStage(preset: Preset) {
    const config = { ...DEFAULT_GLASS_CONTAINER_PARAMS, ...preset.config };
    const entry = this.createContainer(config);
    // Center with slight random offset
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

    // Positioning: Right of the sidebar button
    const rect = anchor.getBoundingClientRect();
    const ghostW = this.ghostContainer?.width || 300;
    const ghostH = this.ghostContainer?.height || 120;
    const gap = 16;
    
    // Default placement: Right of button, Vertically centered on button
    let left = rect.right + gap;
    let top = rect.top + (rect.height / 2) - (ghostH / 2);

    // Safety clamps
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Boundary check for small screens or wide ghosts
    if (left + ghostW > vw - pad) {
       // Just clamp to right edge if it overflows
       left = vw - ghostW - pad;
    }

    if (top < pad) top = pad;
    if (top + ghostH > vh - pad) top = vh - ghostH - pad;

    this.ghostWrapper.style.left = `${left}px`;
    this.ghostWrapper.style.top = `${top}px`;
    this.ghostWrapper.style.opacity = '1';
  }

  public hidePreview() {
    if (this.ghostWrapper) {
      this.ghostWrapper.style.opacity = '0';
      // Move offscreen to avoid blocking interaction while fading out
      setTimeout(() => {
         if (this.ghostWrapper && this.ghostWrapper.style.opacity === '0') {
             this.ghostWrapper.style.left = '-9999px';
         }
      }, 200);
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
        
        // Pass the button as the anchor
        btn.onmouseenter = () => this.showPreview(p, btn);
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
    
    if (id) {
        const entry = this.containers.get(id);
        if (entry) {
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