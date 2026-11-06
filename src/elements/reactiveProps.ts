import type { GlassParams } from '../core/params.js';

/**
 * Attribute ↔ property plumbing for the custom elements. Replaces Lit's `@property`: a schema
 * drives `observedAttributes`, attribute parsing (including 1.x attribute aliases), and typed
 * accessors that report changes to the element.
 */

export type PropType = 'number' | 'string' | 'boolean';

export interface PropDef<K extends string = string> {
  key: K;
  /** Canonical kebab-case attribute. */
  attr: string;
  type: PropType;
  /** JS property name on the element when it must differ from `key` (e.g. `blur` collides with `HTMLElement.blur()`). */
  prop?: string;
  /** 1.x attribute names still accepted. */
  aliases?: readonly string[];
  /** Convert a value read from an alias attribute (after type parsing). */
  fromAlias?: (value: unknown) => unknown;
}

export const GLASS_PROP_SCHEMA: readonly PropDef<keyof GlassParams>[] = [
  { key: 'width', attr: 'width', type: 'number' },
  { key: 'height', attr: 'height', type: 'number' },
  { key: 'radius', attr: 'radius', type: 'number' },
  { key: 'bezelWidth', attr: 'bezel-width', type: 'number' },
  { key: 'surface', attr: 'surface', type: 'string' },
  { key: 'refractiveIndex', attr: 'refractive-index', type: 'number' },
  { key: 'glassThickness', attr: 'glass-thickness', type: 'number' },
  { key: 'displacementScale', attr: 'displacement-scale', type: 'number', aliases: ['scale-px'] },
  { key: 'physicalScale', attr: 'physical-scale', type: 'boolean' },
  { key: 'dispersion', attr: 'dispersion', type: 'number' },
  { key: 'blurKind', attr: 'blur-kind', type: 'string' },
  { key: 'blurStage', attr: 'blur-stage', type: 'string' },
  { key: 'blur', attr: 'blur', type: 'number', prop: 'blurAmount', aliases: ['blur-std-dev'] },
  { key: 'specular', attr: 'specular', type: 'boolean', aliases: ['show-specular'] },
  { key: 'specularAngleDeg', attr: 'specular-angle-deg', type: 'number' },
  { key: 'specularStrength', attr: 'specular-strength', type: 'number' },
  { key: 'shade', attr: 'shade', type: 'number' },
  { key: 'tint', attr: 'tint', type: 'number', aliases: ['frost'] },
  { key: 'saturation', attr: 'saturation', type: 'number' },
];

/** Parse an attribute string by type. `undefined` means "unset / invalid: fall back to default". */
export function parseAttr(type: PropType, value: string | null): unknown {
  if (value === null) return type === 'boolean' ? false : undefined;
  switch (type) {
    case 'number': {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return value !== 'false';
    default:
      return value;
  }
}

/** Every attribute an element with this schema should observe (canonical names and aliases). */
export function observedAttributesOf(schema: readonly PropDef[]): string[] {
  const out: string[] = [];
  for (const d of schema) out.push(d.attr, ...(d.aliases ?? []));
  return out;
}

/** Map an attribute change to a property patch, or null if the attribute is not in the schema. */
export function attrPatch<K extends string>(
  schema: readonly PropDef<K>[],
  name: string,
  value: string | null,
): { key: K; value: unknown } | null {
  for (const d of schema) {
    if (d.attr === name) return { key: d.key, value: parseAttr(d.type, value) };
    if (d.aliases?.includes(name)) {
      const parsed = parseAttr(d.type, value);
      return { key: d.key, value: d.fromAlias && value !== null ? d.fromAlias(parsed) : parsed };
    }
  }
  return null;
}

/** What an element using these helpers must provide. */
export interface ReactiveHost {
  _props: Record<string, unknown>;
  _onPropChange(key: string): void;
}

/** Define typed accessors for each schema key that store into `_props` and notify the host. */
export function defineAccessors<K extends string>(proto: object, schema: readonly PropDef<K>[]): void {
  for (const d of schema) {
    Object.defineProperty(proto, d.prop ?? d.key, {
      configurable: true,
      enumerable: true,
      get(this: ReactiveHost) {
        return this._props[d.key];
      },
      set(this: ReactiveHost, v: unknown) {
        if (this._props[d.key] === v) return;
        this._props[d.key] = v;
        this._onPropChange(d.key);
      },
    });
  }
}

/**
 * Re-route own properties that were assigned before the element was upgraded (e.g. by a
 * framework setting `el.width = 300` before `customElements.define` ran) through the accessors.
 */
export function adoptOwnProps<K extends string>(host: ReactiveHost & object, schema: readonly PropDef<K>[]): void {
  for (const d of schema) {
    const prop = d.prop ?? d.key;
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
      const v = (host as Record<string, unknown>)[prop];
      delete (host as Record<string, unknown>)[prop];
      (host as Record<string, unknown>)[prop] = v;
    }
  }
}
