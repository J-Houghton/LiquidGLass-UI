export type Stage = (f: SVGFilterElement, input: string) => string;

/**
 * Create an SVG element of the given type and set the provided attributes.  This
 * helper is used by the filter graph to assemble filter primitives on demand.
 */
export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, any>
): SVGElementTagNameMap[K] {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n as SVGElementTagNameMap[K];
}

/**
 * Append a sequence of nodes to the end of an existing SVG filter.  The
 * primitives created by the filter graph are appended in order, preserving
 * their relative order.
 */
export function append(f: SVGFilterElement, ...nodes: SVGElement[]) {
  nodes.forEach((n) => f.appendChild(n));
}

/**
 * Remove any previously injected optional nodes from a filter.  Dynamic
 * primitives are marked with the `data-dyn="1"` attribute so that they can
 * be purged when the filter graph is rebuilt.
 */
export function clearDynamic(f: SVGFilterElement) {
  const dyn = f.querySelectorAll('[data-dyn="1"]');
  dyn.forEach((n) => n.remove());
}

/**
 * Compose a sequence of stages into a filter graph.  Starting with the
 * specified input label, each stage is invoked in order and returns the
 * label of the result.  The final result label is returned to the caller.
 */
export function build(f: SVGFilterElement, startIn: string, stages: Stage[]): string {
  let cur = startIn;
  for (const s of stages) cur = s(f, cur);
  return cur;
}