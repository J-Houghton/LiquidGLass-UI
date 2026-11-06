/**
 * liquid-glass-filter/elements: optional custom-element wrappers over the headless API.
 * Importing this module registers nothing; call `defineLiquidGlassElements()` on the client.
 */
import type { GlassFilterOptions } from '../dom/createGlassFilter.js';
import type { LiquidGlassOptions } from '../dom/attachLiquidGlass.js';
import { LiquidGlassElement } from './LiquidGlassElement.js';
import { LiquidGlassFilterElement } from './LiquidGlassFilterElement.js';

export { LiquidGlassElement } from './LiquidGlassElement.js';
export { LiquidGlassFilterElement } from './LiquidGlassFilterElement.js';
export { GLASS_PROP_SCHEMA, parseAttr, attrPatch, observedAttributesOf } from './reactiveProps.js';
export type { PropDef, PropType } from './reactiveProps.js';

export interface DefineLiquidGlassElementsOptions {
  /** Tag prefix. Default `liquid-glass` → `<liquid-glass-container>`, `<liquid-glass-filter>`. */
  prefix?: string;
  /** Defaults merged into every element's attach/create call (dpr, encodeImage, mount, …). */
  defaults?: Partial<LiquidGlassOptions & GlassFilterOptions>;
}

const registered = new WeakSet<CustomElementConstructor>();

function define(name: string, ctor: CustomElementConstructor): void {
  if (customElements.get(name)) return;
  // A constructor can be registered under one name only; later names get a subclass.
  const target = registered.has(ctor) ? class extends ctor {} : ctor;
  customElements.define(name, target);
  registered.add(ctor);
}

/**
 * Register the elements. Idempotent; a no-op where `customElements` does not exist (server).
 */
export function defineLiquidGlassElements(opts: DefineLiquidGlassElementsOptions = {}): void {
  if (typeof customElements === 'undefined') return;
  if (opts.defaults) {
    LiquidGlassElement.defaults = { ...LiquidGlassElement.defaults, ...opts.defaults };
    LiquidGlassFilterElement.defaults = { ...LiquidGlassFilterElement.defaults, ...opts.defaults };
  }
  const prefix = opts.prefix ?? 'liquid-glass';
  define(`${prefix}-container`, LiquidGlassElement as unknown as CustomElementConstructor);
  define(`${prefix}-filter`, LiquidGlassFilterElement as unknown as CustomElementConstructor);
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-glass-container': LiquidGlassElement;
    'liquid-glass-filter': LiquidGlassFilterElement;
  }
}
