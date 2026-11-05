/**
 * Characterization of the current (Lit-era) FilterGraph before it is ported to a pure spec
 * builder (plan Phase 2). Snapshots pin the exact primitives and attributes produced for
 * every structural combination, plus the attribute edits made by updateParams.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LitElement } from 'lit';
import { FilterGraph } from '../../src/components/filterGraph';
import { installFakeDom, SVG_NS, type FakeDocument, type FakeElement } from '../helpers/fakeDom';

type BlurKind = 'gauss' | 'noise1' | 'noise2';

/** Mirror of the static template in liquid-glass-filter.ts render(). */
function makeHost(doc: FakeDocument, width = 300, height = 120, id = 'lg-test') {
  const root = doc.createElement('div');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const defs = doc.createElementNS(SVG_NS, 'defs');
  const filter = doc.createElementNS(SVG_NS, 'filter');
  for (const [k, v] of Object.entries({
    id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    x: '0',
    y: '0',
    width: String(width),
    height: String(height),
    'color-interpolation-filters': 'sRGB',
  })) {
    filter.setAttribute(k, v);
  }
  const map = doc.createElementNS(SVG_NS, 'feImage');
  for (const [k, v] of Object.entries({ x: '0', y: '0', width: String(width), height: String(height), preserveAspectRatio: 'none', result: 'map' })) map.setAttribute(k, v);
  const disp = doc.createElementNS(SVG_NS, 'feDisplacementMap');
  for (const [k, v] of Object.entries({ in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', scale: '0', result: 'refr' })) disp.setAttribute(k, v);
  const spec = doc.createElementNS(SVG_NS, 'feImage');
  for (const [k, v] of Object.entries({ x: '0', y: '0', width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'specSrc' })) spec.setAttribute(k, v);
  filter.append(map, disp, spec);
  defs.appendChild(filter);
  svg.appendChild(defs);
  root.appendChild(svg);
  const host = { renderRoot: root } as unknown as LitElement;
  return { host, filter };
}

const COMBOS: { dispersion: number; blurKind: BlurKind; showSpecular: boolean }[] = [];
for (const dispersion of [0, 1]) {
  for (const blurKind of ['gauss', 'noise1', 'noise2'] as BlurKind[]) {
    for (const showSpecular of [false, true]) COMBOS.push({ dispersion, blurKind, showSpecular });
  }
}

describe('FilterGraph (characterization)', () => {
  let doc: FakeDocument;
  let restore: () => void;
  beforeEach(() => {
    ({ document: doc, restore } = installFakeDom());
  });
  afterEach(() => restore());

  for (const combo of COMBOS) {
    const label = `dispersion=${combo.dispersion} blur=${combo.blurKind} specular=${combo.showSpecular}`;
    it(`${label}: build then update`, () => {
      const { host, filter } = makeHost(doc);
      const graph = new FilterGraph(host);
      graph.hydrateRefs();
      graph.buildIfNeeded({ ...combo, blurStdDev: 0.2, specularStrength: 0.9 });
      expect(filter.toJSON()).toMatchSnapshot('built');
      graph.updateParams({ blurStdDev: 0.5, blurKind: combo.blurKind, specularStrength: 1.1, scale_px: 150, dispersion: combo.dispersion });
      expect(filter.toJSON()).toMatchSnapshot('updated');
    });
  }

  it('does not duplicate dynamic nodes when the structure is unchanged', () => {
    const { host, filter } = makeHost(doc);
    const graph = new FilterGraph(host);
    graph.hydrateRefs();
    const state = { dispersion: 1, blurKind: 'gauss' as const, showSpecular: true, blurStdDev: 0.2, specularStrength: 0.9 };
    graph.buildIfNeeded(state);
    const n = filter.children.length;
    graph.buildIfNeeded({ ...state, blurStdDev: 0.7, specularStrength: 0.1 });
    expect(filter.children.length).toBe(n);
  });

  it('replaces dynamic nodes when the structure changes and keeps the three static ones', () => {
    const { host, filter } = makeHost(doc);
    const graph = new FilterGraph(host);
    graph.hydrateRefs();
    graph.buildIfNeeded({ dispersion: 1, blurKind: 'noise1', showSpecular: true, blurStdDev: 0.2, specularStrength: 0.9 });
    graph.buildIfNeeded({ dispersion: 0, blurKind: 'gauss', showSpecular: false, blurStdDev: 0.2, specularStrength: 0.9 });
    const tags = filter.children.map((c: FakeElement) => c.tagName);
    expect(tags).toEqual(['feImage', 'feDisplacementMap', 'feImage', 'feGaussianBlur']);
    expect(filter.querySelectorAll('[data-dyn="1"]').length).toBe(1);
  });
});
