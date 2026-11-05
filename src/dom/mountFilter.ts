import { filterElementAttrs, type FilterPrimitive, type FilterSpec } from '../core/filters/spec.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** The subset of Document the mounter needs (lets tests pass a fake). */
export type ElementFactory = Pick<Document, 'createElementNS'>;

export interface FilterSvg {
  svg: SVGSVGElement;
  filter: SVGFilterElement;
}

/** Create the hidden `<svg><defs><filter id>` shell. Nothing is appended to the page here. */
export function createFilterSvg(doc: ElementFactory, id: string): FilterSvg {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  const defs = doc.createElementNS(SVG_NS, 'defs');
  const filter = doc.createElementNS(SVG_NS, 'filter') as SVGFilterElement;
  filter.setAttribute('id', id);
  defs.appendChild(filter);
  svg.appendChild(defs);
  return { svg, filter };
}

/**
 * Make `filter` reflect `next`. When the structure is unchanged from `prev`, only attributes
 * that differ are written (element identity is preserved, which keeps the browser from
 * re-resolving the whole graph). Otherwise the children are rebuilt.
 */
export function applyFilterSpec(doc: ElementFactory, filter: SVGFilterElement, prev: FilterSpec | null, next: FilterSpec): void {
  syncAttrs(filter, prev ? filterElementAttrs(prev) : {}, filterElementAttrs(next));

  const nextPrims = [...next.static, ...next.dynamic];
  const prevPrims = prev ? [...prev.static, ...prev.dynamic] : null;
  const sameStructure =
    prevPrims !== null &&
    prev!.structureKey === next.structureKey &&
    prevPrims.length === nextPrims.length &&
    filter.children.length === nextPrims.length;

  if (!sameStructure) {
    filter.replaceChildren(...nextPrims.map((p) => materialize(doc, p)));
    return;
  }
  const children = Array.from(filter.children) as Element[];
  for (let i = 0; i < nextPrims.length; i++) {
    syncPrimitive(doc, children[i], prevPrims![i], nextPrims[i]);
  }
}

export function materialize(doc: ElementFactory, p: FilterPrimitive): Element {
  const el = doc.createElementNS(SVG_NS, p.tag);
  for (const [k, v] of Object.entries(p.attrs)) el.setAttribute(k, v);
  if (p.children) for (const c of p.children) el.appendChild(materialize(doc, c));
  return el;
}

function syncPrimitive(doc: ElementFactory, el: Element, prev: FilterPrimitive, next: FilterPrimitive): void {
  if (el.tagName !== next.tag || (prev.children?.length ?? 0) !== (next.children?.length ?? 0)) {
    el.replaceWith(materialize(doc, next));
    return;
  }
  syncAttrs(el, prev.attrs, next.attrs);
  if (next.children) {
    const kids = Array.from(el.children) as Element[];
    next.children.forEach((c, i) => syncPrimitive(doc, kids[i], prev.children![i], c));
  }
}

function syncAttrs(el: Element, prev: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): void {
  for (const [k, v] of Object.entries(next)) {
    if (prev[k] !== v) el.setAttribute(k, v);
  }
  for (const k of Object.keys(prev)) {
    if (!(k in next)) el.removeAttribute(k);
  }
}
