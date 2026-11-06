import { Pane, type FolderApi, type ListBladeApi, type TpChangeEvent } from 'tweakpane';
import {
  DEFAULT_GLASS_PARAMS,
  GLASS_PARAM_KEYS,
  SURFACE_FNS,
  SURFACE_KINDS,
  type BlurKind,
  type BlurStage,
  type GlassParams,
} from '../../src/index.js';
import { CONTAINERS_CHANGED_EVENT, REMOVE_CONTAINER_EVENT, SELECT_CONTAINER_EVENT } from './events.js';
import { stage, updateEntry, setGlassDebug, setTwin, replayAppear, APPEAR_MS, type StageEntry } from './demoStage.js';

type PaneParams = GlassParams & {
  target: string;
  debug: boolean;
  appearMs: number;
  compare: boolean;
  twinBlurStage: BlurStage;
};

const BLUR_STAGE_OPTIONS: { text: string; value: BlurStage }[] = [
  { text: 'After displacement', value: 'after' },
  { text: 'Before displacement', value: 'before' },
];

const BLUR_OPTIONS: { text: string; value: BlurKind }[] = [
  { text: 'Gauss', value: 'gauss' },
  { text: 'Noise 1', value: 'noise1' },
  { text: 'Noise 2', value: 'noise2' },
];

type BindingTarget = Pick<FolderApi, 'addBinding'>;
type ContainerListOption = { text: string; value: string };
type PaneBindings = { refresh: () => void }[];
type ContainersChangedEvent = WindowEventMap[typeof CONTAINERS_CHANGED_EVENT];

function containerOptions(): ContainerListOption[] {
  return Array.from(stage.entries.values(), (e) => ({ text: e.label, value: e.id }));
}

function syncParamsFromEntry(entry: StageEntry, params: PaneParams, bindings: PaneBindings) {
  const p = entry.handle.params;
  for (const k of GLASS_PARAM_KEYS) (params as unknown as Record<string, unknown>)[k] = p[k];
  params.debug = entry.debug;
  params.compare = entry.twin !== null;
  params.twinBlurStage = entry.twin?.override.blurStage ?? (p.blurStage === 'after' ? 'before' : 'after');
  bindings.forEach((binding) => binding.refresh());
}

function init() {
  let options = containerOptions();
  if (!options.length) {
    const waitForContainers = (event: ContainersChangedEvent) => {
      if (event.detail?.containers?.length) init();
    };
    window.addEventListener(CONTAINERS_CHANGED_EVENT, waitForContainers, { once: true });
    return;
  }

  const params: PaneParams = {
    ...DEFAULT_GLASS_PARAMS,
    target: options[0]?.value ?? '',
    debug: false,
    appearMs: APPEAR_MS,
    compare: false,
    twinBlurStage: 'before',
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
  let activeEntry: StageEntry | undefined = stage.entries.get(params.target) ?? stage.entries.values().next().value;
  let isSyncing = false;

  /** Bind a GlassParams key: the change goes to the active entry as a one-key patch. */
  const bindParam = <K extends keyof GlassParams>(target: BindingTarget, key: K, config: Record<string, unknown>) => {
    const binding = target.addBinding(params, key, config as never);
    binding.on('change', () => {
      if (isSyncing || !activeEntry) return;
      void updateEntry(activeEntry, { [key]: params[key] } as Partial<GlassParams>);
    });
    bindings.push(binding);
    return binding;
  };

  // --- Container selection ---

  let selectedId = params.target;
  const selectBlade = pane.addBlade({
    view: 'list',
    label: 'Container',
    options,
    value: selectedId,
  }) as ListBladeApi<string>;

  selectBlade.on('change', (event: TpChangeEvent<string>) => {
    selectedId = event.value;
    params.target = event.value;
    updateActiveEntry(event.value);
    if (event.value) window.dispatchEvent(new CustomEvent(SELECT_CONTAINER_EVENT, { detail: { id: event.value } }));
  });

  const deleteButton = pane.addButton({ title: 'Delete container' });
  deleteButton.on('click', () => {
    if (selectedId) window.dispatchEvent(new CustomEvent(REMOVE_CONTAINER_EVENT, { detail: { id: selectedId } }));
  });

  const refreshContainerList = (requestedTarget?: string) => {
    options = containerOptions();
    deleteButton.disabled = !options.length;
    selectBlade.disabled = !options.length;

    if (!options.length) {
      selectedId = '';
      params.target = '';
      activeEntry = undefined;
      selectBlade.options = [];
      selectBlade.value = '' as string;
      bindings.forEach((binding) => binding.refresh());
      return;
    }

    selectBlade.options = options;
    const preferred =
      requestedTarget && stage.entries.has(requestedTarget)
        ? requestedTarget
        : selectedId && stage.entries.has(selectedId)
          ? selectedId
          : options[0].value;
    selectedId = preferred;
    params.target = preferred;
    selectBlade.value = preferred;
    updateActiveEntry(preferred);
  };

  deleteButton.disabled = !stage.entries.size;
  selectBlade.disabled = !stage.entries.size;
  window.addEventListener(CONTAINERS_CHANGED_EVENT, (event: ContainersChangedEvent) => {
    refreshContainerList(event.detail?.activeId);
  });

  // --- Bindings (2.0 parameter names; see docs/modernization-plan.md OQ-5) ---

  const geometry = pane.addFolder({ title: 'Geometry' });
  bindParam(geometry, 'width', { min: 50, max: 900, step: 1 });
  bindParam(geometry, 'height', { min: 50, max: 600, step: 1 });
  bindParam(geometry, 'radius', { min: 0, max: 240, step: 1 });
  bindParam(geometry, 'bezelWidth', { min: 1, max: 220, step: 1, label: 'Bezel' });
  bindParam(geometry, 'surface', {
    label: 'Surface',
    options: SURFACE_KINDS.map((kind) => ({ text: SURFACE_FNS[kind].title, value: kind })),
  });

  const optics = pane.addFolder({ title: 'Optics' });
  bindParam(optics, 'refractiveIndex', { min: 1, max: 2.2, step: 0.01, label: 'IOR' });
  bindParam(optics, 'glassThickness', { min: 0, max: 200, step: 1, label: 'Glass thickness (px)' });
  bindParam(optics, 'displacementScale', { min: 0, max: 400, step: 1, label: 'Displacement px' });
  bindParam(optics, 'physicalScale', { label: 'Physical scale' });
  bindParam(optics, 'blurKind', { label: 'Blur kind', options: BLUR_OPTIONS });
  bindParam(optics, 'blurStage', { label: 'Blur stage', options: BLUR_STAGE_OPTIONS });
  bindParam(optics, 'blur', { min: 0, max: 3, step: 0.01, label: 'Blur' });
  const debugBinding = optics.addBinding(params, 'debug', { label: 'Show Map (Debug)' });
  debugBinding.on('change', () => {
    if (isSyncing || !activeEntry) return;
    setGlassDebug(activeEntry, params.debug);
  });
  bindings.push(debugBinding);

  const chromatic = pane.addFolder({ title: 'Chromatic' });
  bindParam(chromatic, 'dispersion', { min: 0, max: 10, step: 0.1, label: 'Dispersion' });

  const specular = pane.addFolder({ title: 'Specular' });
  bindParam(specular, 'specular', { label: 'Enable' });
  bindParam(specular, 'specularAngleDeg', { min: 0, max: 180, step: 1, label: 'Angle°' });
  bindParam(specular, 'specularStrength', { min: 0, max: 2, step: 0.01, label: 'Strength' });

  const look = pane.addFolder({ title: 'Tint & Saturation' });
  bindParam(look, 'tint', { min: 0, max: 1, step: 0.01 });
  bindParam(look, 'saturation', { min: 0, max: 3, step: 0.05 });

  // --- Entrance animation: tune the duration, replay on the active glass (and its twin) ---
  const motion = pane.addFolder({ title: 'Appear' });
  bindings.push(motion.addBinding(params, 'appearMs', { min: 0, max: 2000, step: 50, label: 'Duration ms' }));
  motion.addButton({ title: 'Replay appear' }).on('click', () => {
    if (activeEntry) void replayAppear(activeEntry, params.appearMs);
  });

  // --- A/B twin: a second glass that mirrors every control above except the override ---
  const compare = pane.addFolder({ title: 'Compare (A/B twin)' });
  const compareBinding = compare.addBinding(params, 'compare', { label: 'Show twin' });
  compareBinding.on('change', () => {
    if (isSyncing || !activeEntry) return;
    setTwin(activeEntry, params.compare ? { blurStage: params.twinBlurStage } : null);
  });
  bindings.push(compareBinding);
  const twinBinding = compare.addBinding(params, 'twinBlurStage', { label: 'Twin blur stage', options: BLUR_STAGE_OPTIONS });
  twinBinding.on('change', () => {
    if (isSyncing || !activeEntry || !params.compare) return;
    setTwin(activeEntry, { blurStage: params.twinBlurStage });
  });
  bindings.push(twinBinding);

  function updateActiveEntry(newTarget: string) {
    if (!newTarget) {
      activeEntry = undefined;
      bindings.forEach((binding) => binding.refresh());
      return;
    }
    const next = stage.entries.get(newTarget);
    if (!next) return;
    activeEntry = next;
    isSyncing = true;
    syncParamsFromEntry(next, params, bindings);
    isSyncing = false;
  }

  if (activeEntry) {
    isSyncing = true;
    syncParamsFromEntry(activeEntry, params, bindings);
    isSyncing = false;
  } else {
    bindings.forEach((binding) => binding.refresh());
  }

  // --- Drag handling for the pane itself ---
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
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
  });
  handle.addEventListener('pointermove', (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - host.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - host.offsetHeight - margin);
    host.style.left = `${Math.min(Math.max(startLeft + event.clientX - startX, margin), maxLeft)}px`;
    host.style.top = `${Math.min(Math.max(startTop + event.clientY - startY, margin), maxTop)}px`;
  });
  const endDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    handle.releasePointerCapture(pointerId);
    pointerId = null;
    host.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}

/** Mount the control pane once the DOM is ready. Called from demo/main.ts. */
export function initConfigPane(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
