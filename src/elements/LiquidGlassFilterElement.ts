import type { GlassParams } from '../core/params.js';
import { createGlassFilter, type GlassFilterHandle, type GlassFilterOptions } from '../dom/createGlassFilter.js';
import { ElementBase, type GlassElementProps } from './LiquidGlassElement.js';
import { GLASS_PROP_SCHEMA, adoptOwnProps, attrPatch, defineAccessors, observedAttributesOf } from './reactiveProps.js';

/**
 * `<liquid-glass-filter filter-id="my-glass">`: hosts only the SVG filter. Apply it yourself
 * with `backdrop-filter: url(#my-glass)` on any element. `width`/`height` must match that
 * element's size (the filter region is in its coordinate space).
 */
export class LiquidGlassFilterElement extends ElementBase {
  static readonly observedAttributes: readonly string[] = [...observedAttributesOf(GLASS_PROP_SCHEMA), 'filter-id'];
  /** Options merged into every instance's `createGlassFilter` call (set via defineLiquidGlassElements). */
  static defaults: Partial<GlassFilterOptions> = {};

  _props: Record<string, unknown> = {};
  private _filter: GlassFilterHandle | null = null;
  private _pending: Record<string, unknown> | null = null;

  constructor() {
    super();
    adoptOwnProps(this, GLASS_PROP_SCHEMA);
  }

  /** The live handle, or null while disconnected. */
  get filter(): GlassFilterHandle | null {
    return this._filter;
  }

  get filterId(): string {
    return (this as unknown as HTMLElement).getAttribute('filter-id') ?? this._filter?.id ?? '';
  }
  set filterId(v: string) {
    (this as unknown as HTMLElement).setAttribute('filter-id', v);
  }

  /** `url(#id)` for CSS, or '' before connection. */
  get url(): string {
    return this._filter?.url ?? '';
  }

  connectedCallback(): void {
    this._create();
  }

  disconnectedCallback(): void {
    this._destroy();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === 'filter-id') {
      if (this._filter && old !== value) {
        this._destroy();
        this._create();
      }
      return;
    }
    const patch = attrPatch(GLASS_PROP_SCHEMA, name, value);
    if (!patch) return;
    if (this._props[patch.key] === patch.value) return;
    this._props[patch.key] = patch.value;
    this._onPropChange(patch.key);
  }

  _onPropChange(key: string): void {
    if (!this._filter) return;
    const schedule = this._pending === null;
    this._pending = { ...(this._pending ?? {}), [key]: this._props[key] };
    if (schedule) queueMicrotask(() => this._flush());
  }

  private _create(): void {
    if (this._filter) return;
    const self = this as unknown as HTMLElement;
    const defaults = (this.constructor as typeof LiquidGlassFilterElement).defaults;
    const id = self.getAttribute('filter-id');
    this._filter = createGlassFilter(self, {
      ...defaults,
      ...(this._props as Partial<GlassParams>),
      ...(id ? { id } : {}),
      onRender: (h) => self.dispatchEvent(new CustomEvent('liquid-glass:render', { detail: { handle: h }, bubbles: false })),
    });
  }

  private _destroy(): void {
    this._filter?.destroy();
    this._filter = null;
    this._pending = null;
  }

  private _flush(): void {
    const patch = this._pending;
    this._pending = null;
    if (!patch || !this._filter) return;
    void this._filter.update(patch as Partial<GlassParams>);
  }
}

defineAccessors(LiquidGlassFilterElement.prototype, GLASS_PROP_SCHEMA);

export interface LiquidGlassFilterElement extends GlassElementProps {}
