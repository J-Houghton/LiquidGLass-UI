import { Pane, type FolderApi, type ListBladeApi, type TpChangeEvent } from 'tweakpane';
import type { LiquidGlassContainer } from '../lib/liquid-glass-container.js';
import { SURFACE_FNS, type SurfaceKind } from '../lib/optics/surfaces.js';

type BlurKind = 'gauss' | 'noise1' | 'noise2';

type PaneParams = {
  target: string;
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  glassThickness: number;
  surface: SurfaceKind;
  refractiveIndex: number;
  scalePx: number;
  blurKind: BlurKind;
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
  bgStop1: string;
  bgStop2: string;
  gridColor: string;
  darkTheme: boolean;
};

const SURFACES: SurfaceKind[] = ['convex_circle', 'convex_squircle', 'concave', 'lip'];
const BLUR_OPTIONS: { text: string; value: BlurKind }[] = [
  { text: 'Gauss', value: 'gauss' },
  { text: 'Noise 1', value: 'noise1' },
  { text: 'Noise 2', value: 'noise2' },
];

type BindingTarget = Pick<FolderApi, 'addBinding'>;

type ContainerListOption = { text: string; value: string };

type PaneBindings = { refresh: () => void }[];
const CONTAINERS_CHANGED_EVENT = 'demo-stage:containers-changed';
const REMOVE_CONTAINER_EVENT = 'demo-stage:remove-container';
const SELECT_CONTAINER_EVENT = 'demo-stage:select-container';

type ContainersChangedEvent = WindowEventMap[typeof CONTAINERS_CHANGED_EVENT];

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value.trim() || fallback;
}

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
}

function applyBackground(params: Pick<PaneParams, 'bgStop1' | 'bgStop2' | 'gridColor'>) {
  const root = document.documentElement;
  root.style.setProperty('--demo-bg-stop-1', params.bgStop1);
  root.style.setProperty('--demo-bg-stop-2', params.bgStop2);
  root.style.setProperty('--demo-grid-color', params.gridColor);
}

function collectContainers(): { map: Map<string, LiquidGlassContainer>; options: ContainerListOption[] } {
  const nodes = Array.from(document.querySelectorAll<LiquidGlassContainer>('liquid-glass-container'));
  const map: Map<string, LiquidGlassContainer> = new Map();
  const options = nodes.map((node, index) => {
    const label = node.getAttribute('aria-label') || node.id || `Container ${index + 1}`;
    const key = node.id || `container-${index + 1}`;
    if (!node.id) {
      node.id = key;
    }
    map.set(key, node);
    return { text: label, value: key };
  });
  return { map, options };
}

function syncParamsFromContainer(
  container: LiquidGlassContainer,
  params: PaneParams,
  bindings: PaneBindings,
  backgroundSynced = false,
) {
  params.width = container.width;
  params.height = container.height;
  params.radius = container.radius;
  params.bezelWidth = container.bezelWidth;
  params.glassThickness = container.glassThickness;
  params.surface = (container.surface as SurfaceKind) ?? 'convex_squircle';
  params.refractiveIndex = container.refractiveIndex;
  params.scalePx = container.scalePx;
  params.blurKind = container.blurKind as BlurKind;
  params.blurStdDev = container.blurStdDev;
  params.showSpecular = container.showSpecular;
  params.specularAngleDeg = container.specularAngleDeg;
  params.specularStrength = container.specularStrength;
  params.dispersion = container.dispersion;
  params.disp_r = container.disp_r;
  params.disp_g = container.disp_g;
  params.disp_b = container.disp_b;
  params.frost = container.frost;
  params.saturation = container.saturation;
  if (!backgroundSynced) {
    params.bgStop1 = readCssVar('--demo-bg-stop-1', params.bgStop1);
    params.bgStop2 = readCssVar('--demo-bg-stop-2', params.bgStop2);
    params.gridColor = readCssVar('--demo-grid-color', params.gridColor);
  }
  params.darkTheme = document.documentElement.dataset.theme === 'dark';
  bindings.forEach((binding) => binding.refresh());
}

function init() {
  let { map: containerMap, options } = collectContainers();
  if (!options.length) {
    const waitForContainers = (event: ContainersChangedEvent) => {
      if (event.detail?.containers?.length) {
        init();
      }
    };
    window.addEventListener(CONTAINERS_CHANGED_EVENT, waitForContainers, { once: true });
    return;
  }

  const params: PaneParams = {
    target: options[0]?.value ?? '',
    width: 300,
    height: 120,
    radius: 60,
    bezelWidth: 60,
    glassThickness: 50,
    surface: 'convex_squircle',
    refractiveIndex: 1.5,
    scalePx: 180,
    blurKind: 'gauss',
    blurStdDev: 0.2,
    showSpecular: true,
    specularAngleDeg: 60,
    specularStrength: 0.9,
    dispersion: 0,
    disp_r: 0,
    disp_g: 0,
    disp_b: 0,
    frost: 0.1,
    saturation: 1,
    bgStop1: readCssVar('--demo-bg-stop-1', '#eef2ff'),
    bgStop2: readCssVar('--demo-bg-stop-2', '#bfdbfe'),
    gridColor: readCssVar('--demo-grid-color', 'rgba(15, 23, 42, 0.12)'),
    darkTheme: document.documentElement.dataset.theme === 'dark',
  };

  const host = document.createElement('div');
  host.className = 'config-pane-host';
  const handle = document.createElement('div');
 handle.className = 'config-pane-handle';
  host.append(handle);
  const wrapper = document.createElement('div');
  wrapper.className = 'config-pane-wrapper';
  host.append(wrapper);
  document.body.append(host);

  const pane = new Pane({ title: 'Liquid Glass Controls', container: wrapper });
  const bindings: PaneBindings = [];

  const bind = <K extends keyof PaneParams>(
    target: BindingTarget,
    key: K,
    config: Record<string, unknown>,
    onChange: () => void,
  ) => {
    const binding = target.addBinding(params, key, config as any);
    binding.on('change', () => {
      if (isSyncing) return;
      onChange();
    });
    bindings.push(binding);
    return binding;
  };

  let activeContainer: LiquidGlassContainer | undefined = containerMap.get(params.target) ?? containerMap.values().next().value;
  if (activeContainer) {
    const entry = [...containerMap.entries()].find(([, value]) => value === activeContainer);
    if (entry) {
      params.target = entry[0];
    }
  }

  let isSyncing = false;

  let selectedId = params.target;
  const selectBlade = pane.addBlade({
    view: 'list',
    label: 'Container',
    options,
    value: selectedId,
  }) as ListBladeApi<string>;
  selectBlade.on('change', (event: TpChangeEvent<string>) => {
    const value = event.value;
    selectedId = value;
    params.target = value;
    updateActiveContainer(value);
    if (value) {
      window.dispatchEvent(new CustomEvent(SELECT_CONTAINER_EVENT, { detail: { id: value } }));
    }
  });

  const deleteButton = pane.addButton({ title: 'Delete container' });
  deleteButton.on('click', () => {
    if (!selectedId) return;
    window.dispatchEvent(new CustomEvent(REMOVE_CONTAINER_EVENT, { detail: { id: selectedId } }));
  });

  const refreshContainerList = (requestedTarget?: string) => {
    const snapshot = collectContainers();
    containerMap = snapshot.map;
    options = snapshot.options;
    deleteButton.disabled = !options.length;
    selectBlade.disabled = !options.length;

    if (!options.length) {
      selectedId = '';
      params.target = '';
      activeContainer = undefined;
      selectBlade.options = [];
      selectBlade.value = '' as string;
      bindings.forEach((binding) => binding.refresh());
      return;
    }

    selectBlade.options = options;
    const preferred = requestedTarget && containerMap.has(requestedTarget)
      ? requestedTarget
      : selectedId && containerMap.has(selectedId)
        ? selectedId
        : options[0].value;
    selectedId = preferred;
    params.target = preferred;
    selectBlade.value = preferred;
    updateActiveContainer(preferred);
  };

  deleteButton.disabled = !containerMap.size;
  selectBlade.disabled = !containerMap.size;
  const handleContainersChanged = (event: ContainersChangedEvent) => {
    refreshContainerList(event.detail?.activeId);
  };
  window.addEventListener(CONTAINERS_CHANGED_EVENT, handleContainersChanged);
  const geometry = pane.addFolder({ title: 'Geometry' });
  bind(geometry, 'width', { min: 50, max: 900, step: 1 }, () => {
    if (!activeContainer) return;
    activeContainer.width = params.width;
  });
  bind(geometry, 'height', { min: 50, max: 600, step: 1 }, () => {
    if (!activeContainer) return;
    activeContainer.height = params.height;
  });
  bind(geometry, 'radius', { min: 0, max: 240, step: 1 }, () => {
    if (!activeContainer) return;
    activeContainer.radius = params.radius;
  });
  bind(geometry, 'bezelWidth', { min: 1, max: 220, step: 1, label: 'Bezel' }, () => {
    if (!activeContainer) return;
    activeContainer.bezelWidth = params.bezelWidth;
  });
  bind(
    geometry,
    'surface',
    {
      label: 'Surface',
      options: SURFACES.map((kind) => ({ text: SURFACE_FNS[kind].title, value: kind })),
    },
    () => {
      if (!activeContainer) return;
      activeContainer.surface = params.surface;
    },
  );

  const optics = pane.addFolder({ title: 'Optics' });
  bind(optics, 'refractiveIndex', { min: 1, max: 2.2, step: 0.01, label: 'IOR' }, () => {
    if (!activeContainer) return;
    activeContainer.refractiveIndex = params.refractiveIndex;
  });
  bind(optics, 'glassThickness', { min: 1, max: 200, step: 1, label: 'Glass thickness' }, () => {
    if (!activeContainer) return;
    activeContainer.glassThickness = params.glassThickness;
  });
  bind(optics, 'scalePx', { min: 0, max: 400, step: 1, label: 'Scale px' }, () => {
    if (!activeContainer) return;
    activeContainer.scalePx = params.scalePx;
  });
  bind(optics, 'blurKind', { label: 'Blur kind', options: BLUR_OPTIONS }, () => {
    if (!activeContainer) return;
    activeContainer.blurKind = params.blurKind;
  });
  bind(optics, 'blurStdDev', { min: 0, max: 3, step: 0.01, label: 'Blur σ' }, () => {
    if (!activeContainer) return;
    activeContainer.blurStdDev = params.blurStdDev;
  });

  const chromatic = pane.addFolder({ title: 'Chromatic' });
  bind(chromatic, 'dispersion', { min: 0, max: 5, step: 0.05 }, () => {
    if (!activeContainer) return;
    activeContainer.dispersion = params.dispersion;
  });
  bind(chromatic, 'disp_r', { min: -80, max: 80, step: 0.5, label: 'Disp R' }, () => {
    if (!activeContainer) return;
    activeContainer.disp_r = params.disp_r;
  });
  bind(chromatic, 'disp_g', { min: -80, max: 80, step: 0.5, label: 'Disp G' }, () => {
    if (!activeContainer) return;
    activeContainer.disp_g = params.disp_g;
  });
  bind(chromatic, 'disp_b', { min: -80, max: 80, step: 0.5, label: 'Disp B' }, () => {
    if (!activeContainer) return;
    activeContainer.disp_b = params.disp_b;
  });

  const specular = pane.addFolder({ title: 'Specular' });
  bind(specular, 'showSpecular', { label: 'Enable' }, () => {
    if (!activeContainer) return;
    activeContainer.showSpecular = params.showSpecular;
  });
  bind(specular, 'specularAngleDeg', { min: 0, max: 180, step: 1, label: 'Angle°' }, () => {
    if (!activeContainer) return;
    activeContainer.specularAngleDeg = params.specularAngleDeg;
  });
  bind(specular, 'specularStrength', { min: 0, max: 2, step: 0.01, label: 'Strength' }, () => {
    if (!activeContainer) return;
    activeContainer.specularStrength = params.specularStrength;
  });

  const frosting = pane.addFolder({ title: 'Frost & Saturation' });
  bind(frosting, 'frost', { min: 0, max: 1, step: 0.01 }, () => {
    if (!activeContainer) return;
    activeContainer.frost = params.frost;
  });
  bind(frosting, 'saturation', { min: 0, max: 3, step: 0.05 }, () => {
    if (!activeContainer) return;
    activeContainer.saturation = params.saturation;
  });

  const background = pane.addFolder({ title: 'Backdrop' });
  bind(background, 'bgStop1', { label: 'Gradient start' }, () => {
    applyBackground({ bgStop1: params.bgStop1, bgStop2: params.bgStop2, gridColor: params.gridColor });
  });
  bind(background, 'bgStop2', { label: 'Gradient end' }, () => {
    applyBackground({ bgStop1: params.bgStop1, bgStop2: params.bgStop2, gridColor: params.gridColor });
  });
  bind(background, 'gridColor', { label: 'Grid color' }, () => {
    applyBackground({ bgStop1: params.bgStop1, bgStop2: params.bgStop2, gridColor: params.gridColor });
  });
  bind(background, 'darkTheme', { label: 'Dark theme' }, () => {
    applyTheme(params.darkTheme);
  });

  function updateActiveContainer(newTarget: string) {
    if (!newTarget) {
      activeContainer = undefined;
      bindings.forEach((binding) => binding.refresh());
      return;
    }
    const next = containerMap.get(newTarget);
    if (!next) return;
    activeContainer = next;
    isSyncing = true;
    syncParamsFromContainer(next, params, bindings, true);
    isSyncing = false;
  }

  if (activeContainer) {
    isSyncing = true;
    syncParamsFromContainer(activeContainer, params, bindings);
    isSyncing = false;
  } else {
    bindings.forEach((binding) => binding.refresh());
  }

  applyBackground({ bgStop1: params.bgStop1, bgStop2: params.bgStop2, gridColor: params.gridColor });
  applyTheme(params.darkTheme);

  // Drag handling
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const startDrag = (event: PointerEvent) => {
    if (pointerId !== null || event.button !== 0) return;
    pointerId = event.pointerId;
    const rect = host.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.transform = 'none';
    handle.setPointerCapture(pointerId);
    host.classList.add('is-dragging');
    event.preventDefault();
  };

  const moveDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - host.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - host.offsetHeight - margin);
    const nextLeft = Math.min(Math.max(startLeft + dx, margin), maxLeft);
    const nextTop = Math.min(Math.max(startTop + dy, margin), maxTop);
    host.style.left = `${nextLeft}px`;
    host.style.top = `${nextTop}px`;
  };

  const endDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    handle.releasePointerCapture(pointerId);
    pointerId = null;
    host.classList.remove('is-dragging');
  };

  handle.addEventListener('pointerdown', startDrag);
  handle.addEventListener('pointermove', moveDrag);
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
 
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
