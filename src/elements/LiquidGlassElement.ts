import type { GlassParams } from '../core/params.js';
import { attachLiquidGlass, type LiquidGlassHandle, type LiquidGlassOptions } from '../dom/attachLiquidGlass.js';
import { attachGlassMotion, type GlassMotionHandle } from '../dom/attachGlassMotion.js';
import { GLASS_PROP_SCHEMA, adoptOwnProps, attrPatch, defineAccessors, observedAttributesOf } from './reactiveProps.js';

/** Safe to evaluate on a server: falls back to a plain class when HTMLElement is absent. */
export const ElementBase: typeof HTMLElement =
  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement ?? (class {} as unknown as typeof HTMLElement);

/**
 * `<liquid-glass-container>`: applies the glass effect to itself. Children render crisp above
 * the glass. Size comes from CSS (or the `width`/`height` attributes, which set the inline
 * size); the effect follows it. Attributes mirror `GlassParams` in kebab-case; 1.x names
 * (`scale-px`, `blur-std-dev`, `show-specular`, `frost`) still work. `appear="400"` plays an
 * entrance of that many ms on connect; `replayAppear()` plays it again. `content="<selector>"`
 * names the element to refract through `filter: url()` where the backdrop lens does not render
 * (resolved in the element's root on connect); `mode="content"` forces that path.
 * `motion="press drag hover"` (any subset; the bare attribute means press and drag) attaches
 * the spring/squash motion.
 */
export class LiquidGlassElement extends ElementBase {
  static readonly observedAttributes: readonly string[] = [...observedAttributesOf(GLASS_PROP_SCHEMA), 'debug', 'appear', 'content', 'mode', 'motion'];
  /** Options merged into every instance's `attachLiquidGlass` call (set via defineLiquidGlassElements). */
  static defaults: Partial<LiquidGlassOptions> = {};

  _props: Record<string, unknown> = {};
  private _glass: LiquidGlassHandle | null = null;
  private _motion: GlassMotionHandle | null = null;
  private _debug = false;
  private _debugEl: HTMLElement | null = null;
  private _pending: Record<string, unknown> | null = null;
  private _appearMs: number | undefined;

  constructor() {
    super();
    adoptOwnProps(this, GLASS_PROP_SCHEMA);
  }

  /** The live handle, or null while disconnected. */
  get glass(): LiquidGlassHandle | null {
    return this._glass;
  }

  /** The motion handle while the `motion` attribute is set and the element is connected. */
  get motion(): GlassMotionHandle | null {
    return this._motion;
  }

  /** Show the displacement map instead of the glass (development aid). */
  get debug(): boolean {
    return this._debug;
  }
  set debug(v: boolean) {
    this._debug = Boolean(v);
    this._syncDebugOverlay();
  }

  /** Entrance duration in ms (the `appear` attribute); undefined = no entrance. */
  get appearMs(): number | undefined {
    return this._appearMs;
  }
  set appearMs(v: number | undefined) {
    this._appearMs = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  }

  /** Play the entrance again (or for the first time). */
  replayAppear(durationMs?: number): Promise<void> {
    return this._glass?.appear(durationMs ?? this._appearMs) ?? Promise.resolve();
  }

  connectedCallback(): void {
    if (this._glass) return;
    this._applyBoxStyles();
    const props = this._props as Partial<GlassParams>;
    const defaults = (this.constructor as typeof LiquidGlassElement).defaults;
    const content = this._resolveContent();
    this._glass = attachLiquidGlass(this, {
      ...defaults,
      ...props,
      size: 'observe',
      radius: props.radius ?? defaults.radius ?? 'css',
      ...(content ? { content } : {}),
      ...(this.getAttribute('mode') === 'content' ? { mode: 'content' as const } : {}),
      ...(this._appearMs !== undefined ? { appear: this._appearMs } : {}),
      onRender: (h) => {
        if (this._debugEl) this._debugEl.style.backgroundImage = h.debug.mapUrl ? `url(${h.debug.mapUrl})` : '';
        this.dispatchEvent(new CustomEvent('liquid-glass:render', { detail: { handle: h }, bubbles: false }));
      },
    });
    this._syncDebugOverlay();
    this._syncMotion();
  }

  disconnectedCallback(): void {
    this._motion?.destroy();
    this._motion = null;
    this._glass?.destroy();
    this._glass = null;
    this._pending = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'debug') {
      this.debug = value !== null && value !== 'false';
      return;
    }
    if (name === 'appear') {
      this.appearMs = value === null ? undefined : parseFloat(value);
      return;
    }
    if (name === 'content' || name === 'mode') {
      // the render path is chosen at attach time: re-attach
      if (this._glass && this.isConnected) {
        this.disconnectedCallback();
        this.connectedCallback();
      }
      return;
    }
    if (name === 'motion') {
      this._syncMotion();
      return;
    }
    const patch = attrPatch(GLASS_PROP_SCHEMA, name, value);
    if (!patch) return;
    if (this._props[patch.key] === patch.value) return;
    this._props[patch.key] = patch.value;
    this._onPropChange(patch.key);
  }

  _onPropChange(key: string): void {
    if (key === 'width' || key === 'height' || key === 'radius') this._applyBoxStyles();
    if (!this._glass) return;
    const schedule = this._pending === null;
    this._pending = { ...(this._pending ?? {}), [key]: this._props[key] };
    if (schedule) queueMicrotask(() => this._flush());
  }

  private _flush(): void {
    const patch = this._pending;
    this._pending = null;
    if (!patch || !this._glass) return;
    void this._glass.update(patch as Partial<GlassParams>);
  }

  /** (Re)attach the motion for the current `motion` attribute. */
  private _syncMotion(): void {
    this._motion?.destroy();
    this._motion = null;
    const attr = this.getAttribute('motion');
    if (attr === null || !this._glass) return;
    const tokens = attr.split(/\s+/).filter(Boolean);
    const all = tokens.length === 0;
    this._motion = attachGlassMotion(this._glass, {
      press: all || tokens.includes('press'),
      drag: all || tokens.includes('drag'),
      hover: tokens.includes('hover'),
    });
  }

  /** The `content` attribute as an element: a selector resolved in this element's root (shadow or document). */
  private _resolveContent(): HTMLElement | undefined {
    const selector = this.getAttribute('content');
    if (!selector) return undefined;
    const root = this.getRootNode() as ParentNode;
    const scope = typeof root.querySelector === 'function' ? root : this.ownerDocument;
    try {
      return (scope.querySelector(selector) as HTMLElement | null) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private _applyBoxStyles(): void {
    const style = (this as unknown as HTMLElement).style;
    if (!style) return;
    if (!style.display) style.display = 'block';
    if (!style.position) style.position = 'relative';
    const { width, height, radius } = this._props as Partial<GlassParams>;
    if (typeof width === 'number') style.width = `${width}px`;
    if (typeof height === 'number') style.height = `${height}px`;
    if (typeof radius === 'number') style.borderRadius = `${radius}px`;
  }

  private _syncDebugOverlay(): void {
    const self = this as unknown as HTMLElement;
    if (this._debug && this._glass) {
      if (!this._debugEl) {
        const el = self.ownerDocument.createElement('div');
        el.setAttribute('data-liquid-glass-debug', '');
        el.style.cssText = 'position:absolute;inset:0;pointer-events:none;background-size:cover;border-radius:inherit;z-index:2147483646';
        self.appendChild(el);
        this._debugEl = el;
      }
      this._debugEl.style.backgroundImage = this._glass.debug.mapUrl ? `url(${this._glass.debug.mapUrl})` : '';
    } else if (this._debugEl) {
      this._debugEl.remove();
      this._debugEl = null;
    }
  }
}

defineAccessors(LiquidGlassElement.prototype, GLASS_PROP_SCHEMA);

/** Typed property surface (the accessors are installed above). `blur` is exposed as `blurAmount`. */
export type GlassElementProps = Omit<Partial<GlassParams>, 'blur'> & { blurAmount?: number };
export interface LiquidGlassElement extends GlassElementProps {}
