export type Stage = (f: SVGFilterElement, input: string) => string;

export function el<K extends keyof SVGElementTagNameMap>(
	tag: K, attrs: Record<string, any>
) {
	const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
	return n as SVGElementTagNameMap[K];
}

// insert after a marker node or at end
export function append(f: SVGFilterElement, ...nodes: SVGElement[]) {
	nodes.forEach(n => f.appendChild(n));
}

// remove previously injected optional nodes
export function clearDynamic(f: SVGFilterElement) {
	[...f.querySelectorAll('[data-dyn="1"]')].forEach(n => n.remove());
}

// Compose stages
export function build(f: SVGFilterElement, startIn: string, stages: Stage[]): string {
	let cur = startIn;
	for (const s of stages) cur = s(f, cur);
	return cur;
}
