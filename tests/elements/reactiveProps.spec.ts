import { describe, it, expect } from 'vitest';
import {
  GLASS_PROP_SCHEMA,
  parseAttr,
  attrPatch,
  observedAttributesOf,
  defineAccessors,
  adoptOwnProps,
  type ReactiveHost,
} from '../../src/elements/reactiveProps';
import { GLASS_PARAM_KEYS } from '../../src/core/params';

describe('reactiveProps schema', () => {
  it('covers every GlassParams key exactly once', () => {
    expect(GLASS_PROP_SCHEMA.map((d) => d.key).sort()).toEqual([...GLASS_PARAM_KEYS].sort());
  });

  it('observes canonical attributes and 1.x aliases', () => {
    const attrs = observedAttributesOf(GLASS_PROP_SCHEMA);
    for (const a of ['width', 'bezel-width', 'refractive-index', 'displacement-scale', 'physical-scale', 'blur-stage', 'blur', 'specular', 'tint']) expect(attrs).toContain(a);
    for (const a of ['scale-px', 'blur-std-dev', 'show-specular', 'frost']) expect(attrs).toContain(a);
    expect(new Set(attrs).size).toBe(attrs.length);
  });

  it('parses by type', () => {
    expect(parseAttr('number', '12.5')).toBe(12.5);
    expect(parseAttr('number', 'abc')).toBeUndefined();
    expect(parseAttr('number', null)).toBeUndefined();
    expect(parseAttr('boolean', '')).toBe(true);
    expect(parseAttr('boolean', 'true')).toBe(true);
    expect(parseAttr('boolean', 'false')).toBe(false);
    expect(parseAttr('boolean', null)).toBe(false);
    expect(parseAttr('string', 'lip')).toBe('lip');
    expect(parseAttr('string', null)).toBeUndefined();
  });

  it('maps attributes and aliases to property patches', () => {
    expect(attrPatch(GLASS_PROP_SCHEMA, 'refractive-index', '1.7')).toEqual({ key: 'refractiveIndex', value: 1.7 });
    expect(attrPatch(GLASS_PROP_SCHEMA, 'scale-px', '90')).toEqual({ key: 'displacementScale', value: 90 });
    expect(attrPatch(GLASS_PROP_SCHEMA, 'blur-std-dev', '0.4')).toEqual({ key: 'blur', value: 0.4 });
    expect(attrPatch(GLASS_PROP_SCHEMA, 'show-specular', '')).toEqual({ key: 'specular', value: true });
    expect(attrPatch(GLASS_PROP_SCHEMA, 'frost', '0.2')).toEqual({ key: 'tint', value: 0.2 });
    expect(attrPatch(GLASS_PROP_SCHEMA, 'physical-scale', '')).toEqual({ key: 'physicalScale', value: true });
    expect(attrPatch(GLASS_PROP_SCHEMA, 'chromatic-bezel-factor', '4')).toBeNull(); // 1.x mask factor: gone
    expect(attrPatch(GLASS_PROP_SCHEMA, 'not-a-thing', '1')).toBeNull();
  });

  it('accessors store into _props and notify; adoptOwnProps re-routes pre-upgrade values', () => {
    const changes: string[] = [];
    class Host implements ReactiveHost {
      _props: Record<string, unknown> = {};
      _onPropChange(key: string) {
        changes.push(key);
      }
    }
    defineAccessors(Host.prototype, GLASS_PROP_SCHEMA);
    const h = new Host() as Host & Record<string, unknown>;
    h.width = 300;
    h.width = 300; // same value: no notification
    h.blurKind = 'noise1';
    h.blurAmount = 0.7; // `blur` key is exposed as `blurAmount`
    expect(h._props).toEqual({ width: 300, blurKind: 'noise1', blur: 0.7 });
    expect(changes).toEqual(['width', 'blurKind', 'blur']);
    expect(Object.getOwnPropertyDescriptor(Host.prototype, 'blur')).toBeUndefined();

    const pre = Object.create(Host.prototype) as Host & Record<string, unknown>;
    pre._props = {};
    Object.defineProperty(pre, 'tint', { value: 0.4, writable: true, configurable: true, enumerable: true }); // own prop shadows accessor
    adoptOwnProps(pre, GLASS_PROP_SCHEMA);
    expect(Object.prototype.hasOwnProperty.call(pre, 'tint')).toBe(false);
    expect(pre.tint).toBe(0.4);
    expect(pre._props.tint).toBe(0.4);
  });
});
