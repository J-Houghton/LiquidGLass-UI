import { DEFAULT_GLASS_PARAMS, GLASS_PARAM_KEYS, type GlassParams } from '../../src/index.js';
import { CONFIG_CHANGED_EVENT } from './events.js';
import { APPEAR_MS, DEFAULT_LIGHT, DEFAULT_MOTION, stage, type StageEntry } from './demoStage.js';

/**
 * "Use this glass": the code that reproduces the selected glass in your own page, kept in step
 * with the controls. Two flavours: the JavaScript API and the custom element.
 */

type Flavour = 'js' | 'html';

const lit = (v: unknown): string => (typeof v === 'string' ? `'${v}'` : String(v));
const kebab = (k: string): string => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Parameters that differ from the library defaults. Size is CSS's job, so it is left out. */
function changedParams(entry: StageEntry): [keyof GlassParams, GlassParams[keyof GlassParams]][] {
  const p = entry.handle.params;
  const out: [keyof GlassParams, GlassParams[keyof GlassParams]][] = [];
  const lightDriven = !!entry.lightSettings && (entry.lightSettings.scene || entry.lightSettings.pointer);
  for (const k of GLASS_PARAM_KEYS) {
    if (k === 'width' || k === 'height' || k === 'radius') continue;
    if (k === 'specularAngleDeg' && lightDriven) continue; // the light aims it
    const v = p[k];
    if (v !== DEFAULT_GLASS_PARAMS[k]) out.push([k, typeof v === 'number' ? round(v) : v]);
  }
  return out;
}

function lightOptions(entry: StageEntry): string | null {
  const l = entry.lightSettings;
  if (!l || !(l.scene || l.pointer)) return null;
  const parts: string[] = [];
  if (!l.scene) parts.push('scene: false');
  if (!l.pointer) parts.push('pointer: false');
  else if (l.radius !== DEFAULT_LIGHT.radius) parts.push(`pointer: { radius: ${l.radius} }`);
  if (l.glide !== DEFAULT_LIGHT.glide) parts.push(`spring: { duration: ${l.glide}, bounce: 0 }`);
  return parts.length ? `{ ${parts.join(', ')} }` : '';
}

function motionOptions(entry: StageEntry): string | null {
  const m = entry.motionSettings;
  if (!m || !(m.press || m.drag || m.hover)) return null;
  const parts: string[] = [];
  const customSpring = m.duration !== DEFAULT_MOTION.duration || m.bounce !== DEFAULT_MOTION.bounce;
  if (!m.press) parts.push('press: false');
  else if (customSpring) parts.push(`press: { spring: { duration: ${m.duration}, bounce: ${m.bounce} } }`);
  if (!m.drag) parts.push('drag: false');
  if (m.hover) parts.push('hover: true');
  return parts.length ? `{ ${parts.join(', ')} }` : '';
}

function cssFor(entry: StageEntry): string {
  const p = entry.handle.params;
  return `.glass { width: ${p.width}px; height: ${p.height}px; border-radius: ${p.radius}px; }`;
}

function jsSnippet(entry: StageEntry): string {
  const light = lightOptions(entry);
  const motion = motionOptions(entry);
  const imports = ['attachLiquidGlass', ...(light !== null ? ['attachGlassLight'] : []), ...(motion !== null ? ['attachGlassMotion'] : [])];
  const options = changedParams(entry).map(([k, v]) => `  ${k}: ${lit(v)},`);
  if (entry.attach.lightLayer) options.push('  lightLayer: true,');
  if (entry.attach.path === 'frost') options.push("  support: 'frost', // preview of the fallback; leave this out to detect");
  options.push(`  appear: ${APPEAR_MS},`);
  const lines = [
    `/* CSS */ ${cssFor(entry)}`,
    '',
    `import { ${imports.join(', ')} } from 'liquid-glass-filter';`,
    '',
    `const glass = attachLiquidGlass(document.querySelector('.glass'), {`,
    ...options,
    '});',
  ];
  if (light !== null) lines.push(`attachGlassLight(glass${light ? `, ${light}` : ''});`);
  if (motion !== null) lines.push(`const motion = attachGlassMotion(glass${motion ? `, ${motion}` : ''});`, 'motion.enter(); // spring in as it appears');
  return lines.join('\n');
}

function htmlSnippet(entry: StageEntry): string {
  const p = entry.handle.params;
  const attrs: string[] = [`radius="${p.radius}"`];
  for (const [k, v] of changedParams(entry)) {
    attrs.push(typeof v === 'boolean' ? (v ? kebab(k) : `${kebab(k)}="false"`) : `${kebab(k)}="${v}"`);
  }
  attrs.push(`appear="${APPEAR_MS}"`);
  const l = entry.lightSettings;
  if (l && (l.scene || l.pointer)) attrs.push(l.scene && l.pointer ? 'light' : `light="${l.scene ? 'scene' : 'pointer'}"`);
  const m = entry.motionSettings;
  if (m && (m.press || m.drag || m.hover)) {
    const tokens = [m.press && 'press', m.drag && 'drag', m.hover && 'hover'].filter(Boolean).join(' ');
    attrs.push(tokens === 'press drag' ? 'motion' : `motion="${tokens}"`);
  }
  const body = attrs.map((a) => `  ${a}`).join('\n');
  return [
    '<script type="module">',
    "  import { defineLiquidGlassElements } from 'liquid-glass-filter/elements';",
    '  defineLiquidGlassElements();',
    '</script>',
    '',
    '<liquid-glass-container',
    body,
    `  style="width: ${p.width}px; height: ${p.height}px"`,
    '>',
    '  Your content stays sharp',
    '</liquid-glass-container>',
  ].join('\n');
}

export function initCodePanel(): void {
  const panel = document.getElementById('codePanel');
  const toggle = document.getElementById('btnCode');
  const output = document.getElementById('codeOutput');
  const copy = document.getElementById('btnCopy');
  if (!panel || !toggle || !output || !copy) return;
  const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-flavour]'));
  let flavour: Flavour = 'js';

  const render = () => {
    const entry = stage.activeId ? stage.entries.get(stage.activeId) : undefined;
    output.textContent = entry ? (flavour === 'js' ? jsSnippet(entry) : htmlSnippet(entry)) : 'Add a glass from the presets to see its code.';
  };
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) render();
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
  panel.querySelector('[data-close]')?.addEventListener('click', () => setOpen(false));
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      flavour = tab.dataset.flavour as Flavour;
      for (const t of tabs) t.setAttribute('aria-selected', String(t === tab));
      render();
    });
  }
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(output.textContent ?? '').then(() => {
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1200);
    });
  });
  window.addEventListener(CONFIG_CHANGED_EVENT, () => {
    if (!panel.hidden) render();
  });
  if (new URLSearchParams(location.search).has('code')) setOpen(true);
}
