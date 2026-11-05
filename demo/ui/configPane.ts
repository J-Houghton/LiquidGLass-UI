import { Pane, type FolderApi, type ListBladeApi, type TpChangeEvent } from 'tweakpane';
import type { LiquidGlassContainer } from '../../src/components/liquid-glass-container.js';
import { SURFACE_FNS, type SurfaceKind } from '../../src/core/optics/surfaces.js';
import { DEFAULT_GLASS_CONTAINER_PARAMS, type GlassContainerParams } from '../../src/core/defaults.js';
import { CONTAINERS_CHANGED_EVENT, REMOVE_CONTAINER_EVENT, SELECT_CONTAINER_EVENT } from './events.js';

type BlurKind = 'gauss' | 'noise1' | 'noise2';

type PaneParams = GlassContainerParams & {
  target: string;
  debug: boolean;
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


type ContainersChangedEvent = WindowEventMap[typeof CONTAINERS_CHANGED_EVENT];

function collectContainers(): { map: Map<string, LiquidGlassContainer>; options: ContainerListOption[] } {
  const nodes = Array.from(document.querySelectorAll<LiquidGlassContainer>('liquid-glass-container'));
  const map: Map<string, LiquidGlassContainer> = new Map();
  const options = nodes.map((node, index) => {
    const label = node.getAttribute('aria-label') || node.id || `Container ${index + 1}`;
    const key = node.id || `container-${index + 1}`;
    if (!node.id) node.id = key;
    map.set(key, node);
    return { text: label, value: key };
  });
  return { map, options };
}

function syncParamsFromContainer(
  container: LiquidGlassContainer,
  params: PaneParams,
  bindings: PaneBindings,
) {
  // Sync all properties from the active container to the pane state
  params.width = container.width;
  params.height = container.height;
  params.radius = container.radius;
  params.bezelWidth = container.bezelWidth;
  params.glassThickness = container.glassThickness;
  params.surface = (container.surface as SurfaceKind) ?? DEFAULT_GLASS_CONTAINER_PARAMS.surface;
  params.refractiveIndex = container.refractiveIndex;
  params.scalePx = container.scalePx;
  params.blurKind = (container.blurKind as BlurKind) ?? DEFAULT_GLASS_CONTAINER_PARAMS.blurKind;
  params.blurStdDev = container.blurStdDev;
  params.showSpecular = container.showSpecular;
  params.specularAngleDeg = container.specularAngleDeg;
  params.specularStrength = container.specularStrength;
  params.dispersion = container.dispersion; 
  params.chromaticBezelFactor = container.chromaticBezelFactor;
  params.frost = container.frost;
  params.saturation = container.saturation;
  params.debug = container.debug || false;

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
    ...DEFAULT_GLASS_CONTAINER_PARAMS,
    target: options[0]?.value ?? '',
    debug: false
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
  let isSyncing = false;

  // --- Controls Setup ---

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

  // --- Bindings ---

  const geometry = pane.addFolder({ title: 'Geometry' });
  bind(geometry, 'width', { min: 50, max: 900, step: 1 }, () => activeContainer && (activeContainer.width = params.width));
  bind(geometry, 'height', { min: 50, max: 600, step: 1 }, () => activeContainer && (activeContainer.height = params.height));
  bind(geometry, 'radius', { min: 0, max: 240, step: 1 }, () => activeContainer && (activeContainer.radius = params.radius));
  bind(geometry, 'bezelWidth', { min: 1, max: 220, step: 1, label: 'Bezel' }, () => activeContainer && (activeContainer.bezelWidth = params.bezelWidth));
  bind(geometry, 'surface', {
      label: 'Surface',
      options: SURFACES.map((kind) => ({ text: SURFACE_FNS[kind].title, value: kind })),
    }, () => activeContainer && (activeContainer.surface = params.surface));

  const optics = pane.addFolder({ title: 'Optics' });
  bind(optics, 'refractiveIndex', { min: 1, max: 2.2, step: 0.01, label: 'IOR' }, () => activeContainer && (activeContainer.refractiveIndex = params.refractiveIndex));
  bind(optics, 'glassThickness', { min: 1, max: 200, step: 1, label: 'Glass thickness' }, () => activeContainer && (activeContainer.glassThickness = params.glassThickness));
  bind(optics, 'scalePx', { min: 0, max: 400, step: 1, label: 'Scale px' }, () => activeContainer && (activeContainer.scalePx = params.scalePx));
  bind(optics, 'blurKind', { label: 'Blur kind', options: BLUR_OPTIONS }, () => activeContainer && (activeContainer.blurKind = params.blurKind));
  bind(optics, 'blurStdDev', { min: 0, max: 3, step: 0.01, label: 'Blur σ' }, () => activeContainer && (activeContainer.blurStdDev = params.blurStdDev));
  bind(optics, 'debug', { label: 'Show Map (Debug)' }, () => activeContainer && (activeContainer.debug = params.debug));

  const chromatic = pane.addFolder({ title: 'Chromatic' });
  bind(chromatic, 'dispersion', { min: 0, max: 5, step: 0.05 }, () => activeContainer && (activeContainer.dispersion = params.dispersion));
  // Default range adjusted to match your new defaults (1 to 10 is usually safe for this factor)
  bind(chromatic, 'chromaticBezelFactor', { min: 1, max: 10, step: 0.1, label: 'Edge Tightness' }, () => activeContainer && (activeContainer.chromaticBezelFactor = params.chromaticBezelFactor));

  const specular = pane.addFolder({ title: 'Specular' });
  bind(specular, 'showSpecular', { label: 'Enable' }, () => activeContainer && (activeContainer.showSpecular = params.showSpecular));
  bind(specular, 'specularAngleDeg', { min: 0, max: 180, step: 1, label: 'Angle°' }, () => activeContainer && (activeContainer.specularAngleDeg = params.specularAngleDeg));
  bind(specular, 'specularStrength', { min: 0, max: 2, step: 0.01, label: 'Strength' }, () => activeContainer && (activeContainer.specularStrength = params.specularStrength));

  const frosting = pane.addFolder({ title: 'Frost & Saturation' });
  bind(frosting, 'frost', { min: 0, max: 1, step: 0.01 }, () => activeContainer && (activeContainer.frost = params.frost));
  bind(frosting, 'saturation', { min: 0, max: 3, step: 0.05 }, () => activeContainer && (activeContainer.saturation = params.saturation));

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
    syncParamsFromContainer(next, params, bindings);
    isSyncing = false;
  }

  // Initial Sync
  if (activeContainer) {
    isSyncing = true;
    syncParamsFromContainer(activeContainer, params, bindings);
    isSyncing = false;
  } else {
    bindings.forEach((binding) => binding.refresh());
  }

  // --- Drag Handling (unchanged) ---
  let pointerId: number | null = null;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  const startDrag = (event: PointerEvent) => {
    if (pointerId !== null || event.button !== 0) return;
    pointerId = event.pointerId;
    const rect = host.getBoundingClientRect();
    startX = event.clientX; startY = event.clientY;
    startLeft = rect.left; startTop = rect.top;
    host.style.left = `${rect.left}px`; host.style.top = `${rect.top}px`;
    host.style.right = 'auto'; host.style.bottom = 'auto';
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
    host.style.left = `${Math.min(Math.max(startLeft + dx, margin), maxLeft)}px`;
    host.style.top = `${Math.min(Math.max(startTop + dy, margin), maxTop)}px`;
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