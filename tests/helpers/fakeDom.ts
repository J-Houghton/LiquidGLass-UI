/**
 * A deliberately tiny DOM stand-in for Node tests: enough of Element/Document for the SVG
 * filter builders and the attach/update/destroy layer (createElementNS, attributes, child
 * lists, a small querySelector grammar). Zero dependencies. If this needs to grow past
 * ~150 lines, switch the affected tests to happy-dom instead.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

type Selector = { tag: string | null; attrs: { name: string; value: string | null }[] };

function parseSelector(sel: string): Selector[] {
  return sel.split(',').map((part) => {
    const s = part.trim();
    const m = /^([a-zA-Z][\w-]*)?((?:\[[^\]]+\])*)$/.exec(s);
    if (!m) throw new Error(`fakeDom: unsupported selector "${s}"`);
    const attrs: Selector['attrs'] = [];
    const re = /\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(m[2] ?? '')) !== null) {
      attrs.push({ name: a[1], value: a[2] ?? a[3] ?? a[4] ?? null });
    }
    return { tag: m[1] ?? null, attrs };
  });
}

export type FakeJson = { tag: string; attrs: Record<string, string>; children?: FakeJson[] };

export class FakeElement {
  readonly attrs = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  style: Record<string, string> = {};
  rect = { x: 0, y: 0, top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 };

  constructor(
    readonly tagName: string,
    readonly namespaceURI: string | null,
    readonly ownerDocument: FakeDocument,
  ) {}

  get id(): string {
    return this.attrs.get('id') ?? '';
  }
  set id(v: string) {
    this.attrs.set('id', v);
  }
  get isConnected(): boolean {
    let n: FakeElement | null = this;
    while (n) {
      if (n === this.ownerDocument.documentElement) return true;
      n = n.parentNode;
    }
    return false;
  }

  setAttribute(name: string, value: unknown): void {
    this.attrs.set(name, String(value));
  }
  setAttributeNS(_ns: string | null, name: string, value: unknown): void {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  appendChild<T extends FakeElement>(child: T): T {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes: FakeElement[]): void {
    for (const n of nodes) this.appendChild(n);
  }
  insertBefore<T extends FakeElement>(child: T, ref: FakeElement | null): T {
    if (!ref) return this.appendChild(child);
    child.remove();
    const i = this.children.indexOf(ref);
    if (i < 0) throw new Error('fakeDom: insertBefore reference is not a child');
    child.parentNode = this;
    this.children.splice(i, 0, child);
    return child;
  }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const c of [...this.children]) c.remove();
    this.append(...nodes);
  }
  remove(): void {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  matches(sel: string): boolean {
    return parseSelector(sel).some(
      (s) =>
        (s.tag === null || s.tag === this.tagName) &&
        s.attrs.every((a) => (a.value === null ? this.attrs.has(a.name) : this.attrs.get(a.name) === a.value)),
    );
  }
  *descendants(): IterableIterator<FakeElement> {
    for (const c of this.children) {
      yield c;
      yield* c.descendants();
    }
  }
  querySelectorAll(sel: string): FakeElement[] {
    return [...this.descendants()].filter((n) => n.matches(sel));
  }
  querySelector(sel: string): FakeElement | null {
    for (const n of this.descendants()) if (n.matches(sel)) return n;
    return null;
  }
  getBoundingClientRect() {
    return { ...this.rect };
  }

  toJSON(): FakeJson {
    const attrs: Record<string, string> = {};
    for (const k of [...this.attrs.keys()].sort()) attrs[k] = this.attrs.get(k)!;
    const out: FakeJson = { tag: this.tagName, attrs };
    if (this.children.length) out.children = this.children.map((c) => c.toJSON());
    return out;
  }
}

export class FakeDocument {
  readonly documentElement: FakeElement;
  readonly body: FakeElement;
  constructor() {
    this.documentElement = new FakeElement('html', null, this);
    this.body = this.documentElement.appendChild(new FakeElement('body', null, this));
  }
  createElementNS(ns: string | null, tag: string): FakeElement {
    return new FakeElement(tag, ns, this);
  }
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, null, this);
  }
  getElementById(id: string): FakeElement | null {
    return this.documentElement.querySelector(`[id="${id}"]`);
  }
}

/** Install a fresh fake `document` on globalThis; returns a restore function. */
export function installFakeDom(): { document: FakeDocument; restore: () => void } {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const document = new FakeDocument();
  g.document = document;
  return {
    document,
    restore: () => {
      if (prev === undefined) delete g.document;
      else g.document = prev;
    },
  };
}
