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
import {
  stage,
  updateEntry,
  setGlassDebug,
  setTwin,
  setMotion,
  setLight,
  setAttach,
  replayAppear,
  APPEAR_MS,
  DEFAULT_ATTACH,
  DEFAULT_MOTION,
  DEFAULT_LIGHT,
  type AttachSettings,
  type LightSettings,
  type MotionSettings,
  type StageEntry,
} from './demoStage.js';

/**
 * The inspector: Tweakpane docked on the right, one tab per chapter of the usage guide
 * (Glass = parameters, Light = rim + attachGlassLight, Motion = appear + attachGlassMotion,
 * More = fallback preview, map view, A/B twin).
 */

type PaneParams = GlassParams & {
  target: string;
  debug: boolean;
  appearMs: number;
  compare: boolean;
  twinBlurStage: BlurStage;
  twinShadeOn: boolean;
  twinShade: number;
  motionPress: boolean;
  motionDrag: boolean;
  motionHover: boolean;
  motionDuration: number;
  motionBounce: number;
  lightScene: boolean;
  lightPointer: boolean;
  lightRadius: number;
  lightGlide: number;
  lightLayer: boolean;
  path: AttachSettings['path'];
};

const lightSettingsOf = (p: PaneParams): LightSettings => ({
  scene: p.lightScene,
  pointer: p.lightPointer,
  radius: p.lightRadius,
  glide: p.lightGlide,
});

const motionSettingsOf = (p: PaneParams): MotionSettings => ({
  press: p.motionPress,
  drag: p.motionDrag,
  hover: p.motionHover,
  duration: p.motionDuration,
  bounce: p.motionBounce,
});

const attachSettingsOf = (p: PaneParams): AttachSettings => ({ lightLayer: p.lightLayer, path: p.path });

const twinOverride = (p: PaneParams): Partial<GlassParams> => ({
  blurStage: p.twinBlurStage,
  ...(p.twinShadeOn ? { shade: p.twinShade } : {}),
});

const BLUR_STAGE_OPTIONS: { text: string; value: BlurStage }[] = [
  { text: 'After refraction', value: 'after' },
  { text: 'Before refraction', value: 'before' },
];

const BLUR_OPTIONS: { text: string; value: BlurKind }[] = [
  { text: 'Smooth (Gaussian)', value: 'gauss' },
  { text: 'Coarse texture', value: 'noise1' },
  { text: 'Fine texture', value: 'noise2' },
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
  params.twinBlurStage = entry.twin?.override.blurStage ?? p.blurStage;
  params.twinShadeOn = entry.twin?.override.shade !== undefined;
  params.twinShade = entry.twin?.override.shade ?? 0.35;
  const m = entry.motionSettings ?? { ...DEFAULT_MOTION, press: false, drag: false, hover: false };
  params.motionPress = m.press;
  params.motionDrag = m.drag;
  params.motionHover = m.hover;
  params.motionDuration = m.duration;
  params.motionBounce = m.bounce;
  const l = entry.lightSettings ?? { ...DEFAULT_LIGHT, scene: false, pointer: false };
  params.lightScene = l.scene;
  params.lightPointer = l.pointer;
  params.lightRadius = l.radius;
  params.lightGlide = l.glide;
  params.lightLayer = entry.attach.lightLayer;
  params.path = entry.attach.path;
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
    twinBlurStage: 'after',
    twinShadeOn: true,
    twinShade: 0.35,
    motionPress: DEFAULT_MOTION.press,
    motionDrag: DEFAULT_MOTION.drag,
    motionHover: DEFAULT_MOTION.hover,
    motionDuration: DEFAULT_MOTION.duration,
    motionBounce: DEFAULT_MOTION.bounce,
    lightScene: DEFAULT_LIGHT.scene,
    lightPointer: DEFAULT_LIGHT.pointer,
    lightRadius: DEFAULT_LIGHT.radius,
    lightGlide: DEFAULT_LIGHT.glide,
    lightLayer: DEFAULT_ATTACH.lightLayer,
    path: DEFAULT_ATTACH.path,
  };

  const container = document.getElementById('inspector');
  if (!container) return;
  const pane = new Pane({ container });
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
  /** Bind a pane-only key; `apply` runs on user changes. */
  const bindOwn = <K extends keyof PaneParams>(target: BindingTarget, key: K, config: Record<string, unknown>, apply: (entry: StageEntry) => void) => {
    const binding = target.addBinding(params, key, config as never);
    binding.on('change', () => {
      if (isSyncing || !activeEntry) return;
      apply(activeEntry);
    });
    bindings.push(binding);
    return binding;
  };

  // --- Which glass ---

  let selectedId = params.target;
  const selectBlade = pane.addBlade({ view: 'list', label: 'Editing', options, value: selectedId }) as ListBladeApi<string>;
  selectBlade.on('change', (event: TpChangeEvent<string>) => {
    selectedId = event.value;
    params.target = event.value;
    updateActiveEntry(event.value);
    if (event.value) window.dispatchEvent(new CustomEvent(SELECT_CONTAINER_EVENT, { detail: { id: event.value } }));
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

  const tabs = pane.addTab({ pages: [{ title: 'Glass' }, { title: 'Light' }, { title: 'Motion' }, { title: 'More' }] });
  const [glassTab, lightTab, motionTab, moreTab] = tabs.pages;

  // --- Glass: the parameters (usage guide, "Parameters") ---

  const shape = glassTab.addFolder({ title: 'Shape' });
  bindParam(shape, 'width', { min: 50, max: 900, step: 1, label: 'Width' });
  bindParam(shape, 'height', { min: 50, max: 600, step: 1, label: 'Height' });
  bindParam(shape, 'radius', { min: 0, max: 240, step: 1, label: 'Corner radius' });
  bindParam(shape, 'bezelWidth', { min: 1, max: 220, step: 1, label: 'Rim width' });
  bindParam(shape, 'surface', {
    label: 'Rim profile',
    options: SURFACE_KINDS.map((kind) => ({ text: SURFACE_FNS[kind].title, value: kind })),
  });

  const optics = glassTab.addFolder({ title: 'Refraction' });
  bindParam(optics, 'displacementScale', { min: 0, max: 400, step: 1, label: 'Strength px' });
  bindParam(optics, 'refractiveIndex', { min: 1, max: 2.2, step: 0.01, label: 'Index (IOR)' });
  bindParam(optics, 'glassThickness', { min: 0, max: 200, step: 1, label: 'Thickness px' });
  bindParam(optics, 'physicalScale', { label: 'Physical strength' });
  bindParam(optics, 'magnify', { min: 0, max: 150, step: 1, label: 'Magnify px' });

  const look = glassTab.addFolder({ title: 'Look' });
  bindParam(look, 'tint', { min: 0, max: 1, step: 0.01, label: 'Tint' });
  bindParam(look, 'saturation', { min: 0, max: 3, step: 0.05, label: 'Saturation' });
  bindParam(look, 'blurKind', { label: 'Blur', options: BLUR_OPTIONS });
  bindParam(look, 'blur', { min: 0, max: 3, step: 0.01, label: 'Blur amount' });
  bindParam(look, 'blurStage', { label: 'Blur order', options: BLUR_STAGE_OPTIONS });
  bindParam(look, 'dispersion', { min: 0, max: 10, step: 0.1, label: 'Colour fringe' });
  bindParam(look, 'dispersionUnit', {
    label: 'Fringe unit',
    options: [
      { text: 'Relative to strength', value: 'relative' },
      { text: 'Pixels', value: 'px' },
    ],
  });

  // --- Light: the rim, and attachGlassLight (usage guide, "Light from the page and the pointer") ---

  const rim = lightTab.addFolder({ title: 'Rim highlight' });
  bindParam(rim, 'specular', { label: 'Highlight' });
  bindParam(rim, 'specularStrength', { min: 0, max: 2, step: 0.01, label: 'Brightness' });
  bindParam(rim, 'shade', { min: 0, max: 1, step: 0.01, label: 'Edge shade' });
  const angleBinding = bindParam(rim, 'specularAngleDeg', { min: 0, max: 180, step: 1, label: 'Angle° (manual)' });

  const pageLight = lightTab.addFolder({ title: 'Light follows the page' });
  const refreshAngleLock = () => {
    angleBinding.disabled = params.lightScene || params.lightPointer; // the light drives the angle
  };
  const applyLight = (entry: StageEntry) => {
    setLight(entry, lightSettingsOf(params));
    refreshAngleLock();
  };
  bindOwn(pageLight, 'lightScene', { label: 'Scene light' }, applyLight);
  bindOwn(pageLight, 'lightPointer', { label: 'Follow pointer' }, applyLight);
  bindOwn(pageLight, 'lightRadius', { min: 0, max: 600, step: 10, label: 'Pointer reach px' }, applyLight);
  bindOwn(pageLight, 'lightGlide', { min: 0.1, max: 2, step: 0.05, label: 'Glide s' }, applyLight);
  bindOwn(pageLight, 'lightLayer', { label: 'Own layer (faster)' }, (entry) => setAttach(entry, attachSettingsOf(params)));
  window.addEventListener(CONTAINERS_CHANGED_EVENT, refreshAngleLock);

  // --- Motion: appear, and attachGlassMotion (usage guide, "Motion") ---

  const entrance = motionTab.addFolder({ title: 'Entrance' });
  bindings.push(entrance.addBinding(params, 'appearMs', { min: 0, max: 2000, step: 50, label: 'Duration ms' }));
  entrance.addButton({ title: 'Replay entrance' }).on('click', () => {
    if (activeEntry) void replayAppear(activeEntry, params.appearMs);
  });

  const interaction = motionTab.addFolder({ title: 'Press, drag, hover' });
  const applyMotion = (entry: StageEntry) => setMotion(entry, motionSettingsOf(params));
  bindOwn(interaction, 'motionPress', { label: 'Press' }, applyMotion);
  bindOwn(interaction, 'motionDrag', { label: 'Drag squash' }, applyMotion);
  bindOwn(interaction, 'motionHover', { label: 'Hover lift' }, applyMotion);
  bindOwn(interaction, 'motionDuration', { min: 0.1, max: 1.5, step: 0.05, label: 'Spring s' }, applyMotion);
  bindOwn(interaction, 'motionBounce', { min: -0.5, max: 0.9, step: 0.05, label: 'Bounce' }, applyMotion);
  interaction.addButton({ title: 'Press and release' }).on('click', () => {
    for (const m of activeEntry?.motion ?? []) {
      m.press();
      setTimeout(() => m.release(), 250);
    }
  });

  // --- More: fallback preview, the map, A/B twin, delete ---

  const browser = moreTab.addFolder({ title: 'Browser fallback' });
  bindOwn(
    browser,
    'path',
    {
      label: 'Render path',
      options: [
        { text: 'Auto-detect', value: 'auto' },
        { text: 'Frost (Safari, Firefox)', value: 'frost' },
      ],
    },
    (entry) => setAttach(entry, attachSettingsOf(params)),
  );

  const inspect = moreTab.addFolder({ title: 'Inspect' });
  bindOwn(inspect, 'debug', { label: 'Show displacement map' }, (entry) => setGlassDebug(entry, params.debug));

  const compare = moreTab.addFolder({ title: 'Compare (A/B twin)' });
  bindOwn(compare, 'compare', { label: 'Show twin' }, (entry) => setTwin(entry, params.compare ? twinOverride(params) : null));
  const retwin = (entry: StageEntry) => {
    if (params.compare) setTwin(entry, twinOverride(params));
  };
  bindOwn(compare, 'twinBlurStage', { label: 'Twin blur order', options: BLUR_STAGE_OPTIONS }, retwin);
  bindOwn(compare, 'twinShadeOn', { label: 'Twin overrides shade' }, retwin);
  bindOwn(compare, 'twinShade', { min: 0, max: 1, step: 0.05, label: 'Twin shade' }, retwin);

  const deleteButton = moreTab.addButton({ title: 'Remove this glass' });
  deleteButton.on('click', () => {
    if (selectedId) window.dispatchEvent(new CustomEvent(REMOVE_CONTAINER_EVENT, { detail: { id: selectedId } }));
  });

  deleteButton.disabled = !stage.entries.size;
  selectBlade.disabled = !stage.entries.size;
  window.addEventListener(CONTAINERS_CHANGED_EVENT, (event: ContainersChangedEvent) => {
    refreshContainerList(event.detail?.activeId);
  });

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
    refreshAngleLock();
  }

  if (activeEntry) updateActiveEntry(activeEntry.id);
  else bindings.forEach((binding) => binding.refresh());
}

/** Mount the inspector once the DOM is ready. Called from demo/main.ts. */
export function initConfigPane(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
