import type { LiquidGlassContainer } from '../lib/liquid-glass-container.js';

type ContainerConfig = {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  glassThickness: number;
  surface: string;
  refractiveIndex: number;
  scalePx: number;
  blurKind: 'gauss' | 'noise1' | 'noise2';
  blurStdDev: number;
  showSpecular: boolean;
  specularAngleDeg: number;
  specularStrength: number;
  dispersion: number;
  disp_r: number;
  disp_g: number;
  disp_b: number;
  frost: number;
  saturation: number;
};

type StageEntry = {
  id: string;
  wrapper: HTMLDivElement;
  container: LiquidGlassContainer;
};

type StageContainersChangedDetail = {
  containers: string[];
  activeId?: string;
};

type StageSelectionDetail = {
  id: string;
};

type StageRemovalDetail = StageSelectionDetail;

const DEFAULT_CONTAINER_CONFIG: ContainerConfig = {
  width: 340,
  height: 160,
  radius: 64,
  bezelWidth: 72,
  glassThickness: 48,
  surface: 'convex_squircle',
  refractiveIndex: 1.48,
  scalePx: 210,
  blurKind: 'gauss',
  blurStdDev: 0.24,
  showSpecular: true,
  specularAngleDeg: 58,
  specularStrength: 0.95,
  dispersion: 0.32,
  disp_r: 6,
  disp_g: 0,
  disp_b: -6,
  frost: 0.18,
  saturation: 1.05,
};

const CONTAINERS_CHANGED_EVENT = 'demo-stage:containers-changed';
const REMOVE_REQUEST_EVENT = 'demo-stage:remove-container';
const SELECT_EVENT = 'demo-stage:select-container';

class DemoStageController {
  private readonly stage: HTMLElement;
  private readonly addButton: HTMLButtonElement | null;
  private readonly containers = new Map<string, StageEntry>();
  private activeId: string | undefined;
  private idCounter = 0;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    this.addButton = stage.querySelector<HTMLButtonElement>('[data-action="add-container"]');

    this.handleAddClick = this.handleAddClick.bind(this);
    this.handleRemoveRequest = this.handleRemoveRequest.bind(this);
    this.handleSelectionRequest = this.handleSelectionRequest.bind(this);
  }

  init() {
    if (!this.stage.isConnected) return;
    this.stage.style.position = this.stage.style.position || 'relative';
    this.addButton?.addEventListener('click', this.handleAddClick);
    window.addEventListener(REMOVE_REQUEST_EVENT, this.handleRemoveRequest);
    window.addEventListener(SELECT_EVENT, this.handleSelectionRequest);

    if (!this.containers.size) {
      const entry = this.createContainer({ ...DEFAULT_CONTAINER_CONFIG });
      this.setActiveId(entry.id);
      this.emitChange(entry.id);
    }
  }

  private createContainer(config: ContainerConfig, origin?: StageEntry): StageEntry {
    const container = document.createElement('liquid-glass-container') as LiquidGlassContainer;
    this.applyConfig(container, config);

    this.idCounter += 1;
    const id = `demo-container-${this.idCounter}`;
    container.id = id;
    container.setAttribute('aria-label', `Glass surface ${this.idCounter}`);

    const wrapper = document.createElement('div');
    wrapper.className = 'demo-stage__draggable';
    wrapper.dataset.containerId = id;
    wrapper.style.position = 'fixed';
    wrapper.style.touchAction = 'none';
    wrapper.tabIndex = 0;
    wrapper.append(container);
    document.body.append(wrapper);

 const position = origin
       ? this.offsetFrom(origin, container)
       : (this.containers.size === 0
           ? this.centerInStage(container)   // place initial inside demo box
           : this.centerPosition(container));
    this.positionWrapper(wrapper, position.left, position.top);
    this.makeDraggable(wrapper, id);

    const entry: StageEntry = { id, wrapper, container };
    this.containers.set(id, entry);
    return entry;
  }
  private centerInStage(container: LiquidGlassContainer) {
    const rect = this.stage.getBoundingClientRect();
    const desiredLeft = rect.left + (rect.width - container.width) / 2;
    const desiredTop  = rect.top  + (rect.height - container.height) / 2;
    return this.clampToRect(desiredLeft, desiredTop, container.width, container.height, rect);
  }
   private clampToRect(
    left: number,
    top: number,
    width: number,
    height: number,
    rect: DOMRect
  ) {
    const maxLeft = Math.max(rect.left, rect.right - width);
    const maxTop = Math.max(rect.top, rect.bottom - height);
    return {
      left: Math.min(Math.max(left, rect.left), maxLeft),
      top: Math.min(Math.max(top, rect.top), maxTop),
    };
  }
  private applyConfig(container: LiquidGlassContainer, config: ContainerConfig) {
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
    container.disp_r = config.disp_r;
    container.disp_g = config.disp_g;
    container.disp_b = config.disp_b;
    container.frost = config.frost;
    container.saturation = config.saturation;
  }

  private readConfig(container: LiquidGlassContainer): ContainerConfig {
    return {
      width: container.width,
      height: container.height,
      radius: container.radius,
      bezelWidth: container.bezelWidth,
      glassThickness: container.glassThickness,
      surface: container.surface,
      refractiveIndex: container.refractiveIndex,
      scalePx: container.scalePx,
      blurKind: container.blurKind,
      blurStdDev: container.blurStdDev,
      showSpecular: container.showSpecular,
      specularAngleDeg: container.specularAngleDeg,
      specularStrength: container.specularStrength,
      dispersion: container.dispersion,
      disp_r: container.disp_r,
      disp_g: container.disp_g,
      disp_b: container.disp_b,
      frost: container.frost,
      saturation: container.saturation,
    };
  }

  private centerPosition(container: LiquidGlassContainer) {
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const left = (vw - container.width) / 2;
    const top = (vh - container.height) / 2;
    return this.clampPosition(left, top, container.width, container.height);
  }

  private offsetFrom(entry: StageEntry, container: LiquidGlassContainer) {
    const baseLeft = parseFloat(entry.wrapper.style.left || '0');
    const baseTop = parseFloat(entry.wrapper.style.top || '0');
    const offset = 48;
    return this.clampPosition(baseLeft + offset, baseTop + offset * 0.6, container.width, container.height);
  }

  private clampPosition(left: number, top: number, width: number, height: number) {
    const vw = window.innerWidth || width;
    const vh = window.innerHeight || height;
    const maxLeft = Math.max(0, vw - width);
    const maxTop = Math.max(0, vh - height);
    return {
      left: Math.min(Math.max(left, 0), maxLeft),
      top: Math.min(Math.max(top, 0), maxTop),
    };
  }

  private positionWrapper(wrapper: HTMLDivElement, left: number, top: number) {
    wrapper.style.left = `${left}px`;
    wrapper.style.top = `${top}px`;
  }

  private makeDraggable(wrapper: HTMLDivElement, id: string) {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

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
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const rect = wrapper.getBoundingClientRect();
      const next = this.clampPosition(startLeft + dx, startTop + dy, rect.width, rect.height); 
      this.positionWrapper(wrapper, next.left, next.top);
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
    wrapper.addEventListener('lostpointercapture', () => {
      pointerId = null;
      wrapper.classList.remove('is-dragging');
    });
  }

  private handleAddClick() {
    const template = this.activeId ? this.containers.get(this.activeId) : undefined;
    const config = template ? this.readConfig(template.container) : { ...DEFAULT_CONTAINER_CONFIG };
    const entry = this.createContainer(config, template);
    entry.wrapper.focus({ preventScroll: true });
    this.setActiveId(entry.id);
    this.emitChange(entry.id);
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
    if (this.activeId === id) {
      return false;
    }
    this.activeId = id;
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

function init() {
  const stage = document.querySelector<HTMLElement>('[data-demo-stage]');
  if (!stage) return;
  const controller = new DemoStageController(stage);
  controller.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

export {};

declare global {
  interface WindowEventMap {
    'demo-stage:containers-changed': CustomEvent<StageContainersChangedDetail>;
    'demo-stage:remove-container': CustomEvent<StageRemovalDetail>;
    'demo-stage:select-container': CustomEvent<StageSelectionDetail>;
  }
}