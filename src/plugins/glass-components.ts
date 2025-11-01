import { build, clearDynamic, type Stage } from '../filters/core';
import { blur } from '../filters/blur';
import { chromatic } from '../filters/chromatic';
import { noiseBlur } from '../filters/noiseBlur';
import { specular } from '../filters/specularFilter';
import { driveRgbOffsets } from '../fx/rgbSplit';

export type GlassNoiseKind = 'none' | 'low' | 'high';

export interface GlassEffectOptions {
        blur: number;
        frost: number;
        dispersion: number;
        channels: { r: number; g: number; b: number };
        noise: GlassNoiseKind;
        specular: number;
        specSrc?: string | null;
}

export interface GlassComponentInit {
        effect?: string;
        options?: Partial<GlassEffectOptions>;
}

interface FilterFrame {
        x?: string;
        y?: string;
        width?: string;
        height?: string;
}

export interface GlassComponentConfig {
        /** Unique name that consumers use via the `effect` attribute. */
        effect: string;
        /** Optional custom element tag. Defaults to `glass-card`. */
        tagName?: string;
        /** Default tuning for the effect. */
        defaults?: Partial<GlassEffectOptions>;
        /**
         * Stage factory. Receives the resolved options every time the element updates
         * and must return the SVG filter stages that should be appended.
         */
        createStages?: (options: GlassEffectOptions) => Stage[];
        /** Optional filter region overrides. */
        filterFrame?: FilterFrame;
        /** Custom backdrop-filter declaration. */
        backdrop?: (options: GlassEffectOptions) => string;
}

type InternalEffect = {
        config: GlassComponentConfig;
        defaults: GlassEffectOptions;
        createStages: (options: GlassEffectOptions) => Stage[];
};

export type GlassEffectRegistration = InternalEffect;

const DEFAULT_FILTER_FRAME = {
        x: '-30%',
        y: '-30%',
        width: '160%',
        height: '160%',
};

const BASE_OPTIONS: GlassEffectOptions = {
        blur: 0.6,
        frost: 12,
        dispersion: 0,
        channels: { r: 1, g: 0, b: -1 },
        noise: 'none',
        specular: 0,
        specSrc: null,
};

const DEFAULT_SPEC_SRC = `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">\n' +
                '  <radialGradient id="g" cx="50%" cy="40%">\n' +
                '    <stop offset="0%" stop-color="white" stop-opacity="0.9"/>\n' +
                '    <stop offset="100%" stop-color="white" stop-opacity="0"/>\n' +
                '  </radialGradient>\n' +
                '  <rect width="100%" height="100%" fill="url(#g)"/>\n' +
                '</svg>'
)}`;

const effectRegistry = new Map<string, InternalEffect>();
let defaultEffectName: string | null = null;
let instanceCounter = 0;
const definedTags = new Set<string>();
const liveInstances = new Set<GlassComponent>();

function ensureTagDefined(tagName: string) {
        if (typeof window === 'undefined' || !window.customElements) return;
        if (definedTags.has(tagName)) return;
        if (!window.customElements.get(tagName)) {
                window.customElements.define(tagName, GlassComponent);
        }
        definedTags.add(tagName);
}

function mergeOptions(base: GlassEffectOptions, overrides?: Partial<GlassEffectOptions>) {
        if (!overrides) return;
        if (typeof overrides.blur === 'number' && !Number.isNaN(overrides.blur)) base.blur = overrides.blur;
        if (typeof overrides.frost === 'number' && !Number.isNaN(overrides.frost)) base.frost = overrides.frost;
        if (typeof overrides.dispersion === 'number' && !Number.isNaN(overrides.dispersion)) base.dispersion = overrides.dispersion;
        if (typeof overrides.specular === 'number' && !Number.isNaN(overrides.specular)) base.specular = overrides.specular;
        if (overrides.noise) base.noise = overrides.noise;
        if (overrides.channels) {
                base.channels = { ...base.channels, ...overrides.channels };
        }
        if (overrides.specSrc !== undefined) base.specSrc = overrides.specSrc;
}

function parseAttributeOptions(el: GlassComponent): Partial<GlassEffectOptions> {
        const opts: Partial<GlassEffectOptions> = {};
        const readNumber = (attr: string) => {
                const raw = el.getAttribute(attr);
                if (raw === null) return undefined;
                const num = Number(raw);
                return Number.isFinite(num) ? num : undefined;
        };
        const blur = readNumber('blur');
        if (blur !== undefined) opts.blur = blur;
        const frost = readNumber('frost');
        if (frost !== undefined) opts.frost = frost;
        const dispersion = readNumber('dispersion');
        if (dispersion !== undefined) opts.dispersion = dispersion;
        const specularStrength = readNumber('specular');
        if (specularStrength !== undefined) opts.specular = specularStrength;
        const noiseKind = el.getAttribute('noise-kind');
        if (noiseKind === 'low' || noiseKind === 'high' || noiseKind === 'none') opts.noise = noiseKind;
        const ch: Partial<GlassEffectOptions['channels']> = {};
        const r = readNumber('dispersion-r'); if (r !== undefined) ch.r = r;
        const g = readNumber('dispersion-g'); if (g !== undefined) ch.g = g;
        const b = readNumber('dispersion-b'); if (b !== undefined) ch.b = b;
        if (Object.keys(ch).length) opts.channels = ch as GlassEffectOptions['channels'];
        const specSrc = el.getAttribute('spec-src');
        if (specSrc !== null) opts.specSrc = specSrc;
        return opts;
}

function toInternal(config: GlassComponentConfig): InternalEffect {
        const defaults: GlassEffectOptions = {
                ...BASE_OPTIONS,
                ...config.defaults,
                channels: {
                        ...BASE_OPTIONS.channels,
                        ...(config.defaults?.channels ?? {}),
                },
                specSrc: config.defaults?.specSrc ?? BASE_OPTIONS.specSrc ?? DEFAULT_SPEC_SRC,
        };
        if (!defaults.specSrc) defaults.specSrc = DEFAULT_SPEC_SRC;
        const createStages = config.createStages
                ? config.createStages
                : (options: GlassEffectOptions) => {
                        const stages: Stage[] = [];
                        stages.push(blur(Math.max(0, options.blur)));
                        if (options.noise !== 'none') {
                                const kind = options.noise === 'high' ? 'high' : 'low';
                                stages.push(noiseBlur(kind, Math.max(0.01, options.blur)));
                        }
                        if (options.dispersion !== 0) stages.push(chromatic);
                        if (options.specular > 0) stages.push(specular(options.specular));
                        return stages;
                };
        return { config, defaults, createStages };
}

export function registerGlassComponent(config: GlassComponentConfig) {
        const internal = toInternal(config);
        effectRegistry.set(config.effect, internal);
        if (!defaultEffectName) defaultEffectName = config.effect;
        const tag = config.tagName ?? 'glass-card';
        ensureTagDefined(tag);
        liveInstances.forEach(instance => {
                if (instance.tagName.toLowerCase() === tag.toLowerCase()) instance.refresh();
        });
        return internal;
}

export class GlassComponent extends HTMLElement {
        static get observedAttributes() {
                return ['effect', 'blur', 'frost', 'dispersion', 'noise-kind', 'specular', 'spec-src', 'dispersion-r', 'dispersion-g', 'dispersion-b'];
        }

        private filterEl: SVGFilterElement | null = null;
        private surfaceEl: HTMLElement | null = null;
        private backdropEl: HTMLElement | null = null;
        private specImageEl: SVGImageElement | null = null;
        private filterId: string;
        private initialEffect?: string;
        private optionOverrides: Partial<GlassEffectOptions> | undefined;

        constructor(init?: GlassComponentInit) {
                super();
                this.filterId = `glass-filter-${++instanceCounter}`;
                this.initialEffect = init?.effect;
                this.optionOverrides = init?.options;
                const shadow = this.attachShadow({ mode: 'open' });
                shadow.innerHTML = `
<style>
:host {
        display: block;
        position: relative;
        border-radius: inherit;
        contain: layout style;
}
.wrapper {
        position: relative;
        display: block;
        border-radius: inherit;
        isolation: isolate;
}
svg {
        position: absolute;
        width: 0;
        height: 0;
        pointer-events: none;
        user-select: none;
}
.surface {
        position: relative;
        border-radius: inherit;
        overflow: hidden;
        filter: none;
        background: rgba(255, 255, 255, 0.14);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.backdrop {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: inherit;
        opacity: 0.95;
        z-index: 0;
}
slot {
        position: relative;
        display: block;
        z-index: 1;
}
::slotted(*) {
        position: relative;
        z-index: 1;
}
</style>
<div class="wrapper">
        <svg aria-hidden="true" focusable="false">
                <defs>
                        <filter id="${this.filterId}" filterUnits="objectBoundingBox" x="${DEFAULT_FILTER_FRAME.x}" y="${DEFAULT_FILTER_FRAME.y}" width="${DEFAULT_FILTER_FRAME.width}" height="${DEFAULT_FILTER_FRAME.height}" color-interpolation-filters="sRGB">
                                <feImage x="0" y="0" width="100%" height="100%" result="map"></feImage>
                                <feDisplacementMap in="SourceGraphic" in2="map" id="disp" xChannelSelector="R" yChannelSelector="G" scale="0" result="refr"></feDisplacementMap>
                                <feImage x="0" y="0" width="100%" height="100%" id="specImage" result="specSrc"></feImage>
                        </filter>
                </defs>
        </svg>
        <div class="surface" part="surface">
                <div class="backdrop" part="backdrop"></div>
                <slot></slot>
        </div>
</div>`;
                this.filterEl = shadow.querySelector('filter');
                this.surfaceEl = shadow.querySelector('.surface');
                this.backdropEl = shadow.querySelector('.backdrop');
                this.specImageEl = shadow.querySelector('#specImage');
                if (this.surfaceEl) this.surfaceEl.style.filter = `url(#${this.filterId})`;
        }

        connectedCallback() {
                liveInstances.add(this);
                this.refresh();
        }

        disconnectedCallback() {
                liveInstances.delete(this);
        }

        attributeChangedCallback() {
                this.refresh();
        }

        set options(opts: Partial<GlassEffectOptions>) {
                this.optionOverrides = { ...opts };
                this.refresh();
        }

        get options() {
                return { ...this.optionOverrides };
        }

        set effect(value: string) {
                if (value) this.setAttribute('effect', value);
                else this.removeAttribute('effect');
        }

        get effect() {
                return this.getAttribute('effect') ?? this.initialEffect ?? defaultEffectName ?? '';
        }

        refresh() {
                if (!this.isConnected || !this.filterEl || !this.surfaceEl || !this.backdropEl) return;
                const effectName = this.effect;
                const internal = effectRegistry.get(effectName) ?? (defaultEffectName ? effectRegistry.get(defaultEffectName) : undefined);
                if (!internal) return;
                const { defaults, config, createStages } = internal;
                const resolved: GlassEffectOptions = {
                        ...defaults,
                        channels: { ...defaults.channels },
                        specSrc: defaults.specSrc ?? DEFAULT_SPEC_SRC,
                };
                mergeOptions(resolved, this.optionOverrides);
                mergeOptions(resolved, parseAttributeOptions(this));
                if (!resolved.specSrc) resolved.specSrc = DEFAULT_SPEC_SRC;
                const filter = this.filterEl;
                const frame = { ...DEFAULT_FILTER_FRAME, ...(config.filterFrame ?? {}) };
                Object.entries(frame).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) filter.setAttribute(key, String(value));
                });
                clearDynamic(filter);
                const stages = createStages(resolved);
                if (stages.length) {
                        const startIn = filter.querySelector('[result="refr"]') ? 'refr' : 'SourceGraphic';
                        build(filter, startIn, stages);
                }
                const backdropValue = config.backdrop ? config.backdrop(resolved) : `blur(${Math.max(0, resolved.frost).toFixed(2)}px)`;
                this.backdropEl.style.backdropFilter = backdropValue;
                this.backdropEl.style.setProperty('-webkit-backdrop-filter', backdropValue);
                if (this.specImageEl) {
                        const href = resolved.specSrc ?? DEFAULT_SPEC_SRC;
                        this.specImageEl.setAttribute('href', href);
                }
                this.applyDispersion(resolved);
        }

        private applyDispersion(opts: GlassEffectOptions) {
                if (!this.filterEl) return;
                const hasOffsets = this.filterEl.querySelector('#offR, #offG, #offB');
                if (!hasOffsets) return;
                const doc = document as Document & { [key: string]: any };
                const original = doc.getElementById;
                doc.getElementById = ((id: string) => {
                        return this.filterEl?.querySelector(`#${id}`) ?? original.call(document, id);
                }) as Document['getElementById'];
                try {
                        driveRgbOffsets({
                                dispersion: opts.dispersion,
                                r: opts.channels.r,
                                g: opts.channels.g,
                                b: opts.channels.b,
                        });
                } finally {
                        doc.getElementById = original;
                }
        }
}

export function registerDefaultGlassEffects(tagName = 'glass-card') {
        const results = [
                registerGlassComponent({
                        effect: 'frosted',
                        tagName,
                        defaults: {
                                blur: 0.7,
                                frost: 18,
                                dispersion: 1.8,
                                channels: { r: 1.0, g: 0.25, b: -0.9 },
                                noise: 'low',
                                specular: 0.35,
                                specSrc: DEFAULT_SPEC_SRC,
                        },
                        createStages: (opts) => {
                                const stages: Stage[] = [];
                                stages.push(blur(Math.max(0.01, opts.blur)));
                                stages.push(noiseBlur('low', Math.max(0.05, opts.blur)));
                                stages.push(chromatic);
                                stages.push(specular(Math.max(0, opts.specular)));
                                return stages;
                        },
                        backdrop: (opts) => `blur(${Math.max(0, opts.frost).toFixed(1)}px) saturate(120%)`,
                }),
                registerGlassComponent({
                        effect: 'prismatic',
                        tagName,
                        defaults: {
                                blur: 0.5,
                                frost: 10,
                                dispersion: 2.6,
                                channels: { r: 1.2, g: 0.6, b: -1.1 },
                                noise: 'none',
                                specular: 0.15,
                                specSrc: DEFAULT_SPEC_SRC,
                        },
                        createStages: (opts) => {
                                const stages: Stage[] = [];
                                stages.push(blur(Math.max(0.01, opts.blur)));
                                stages.push(chromatic);
                                stages.push(specular(Math.max(0, opts.specular)));
                                return stages;
                        },
                        backdrop: (opts) => `blur(${Math.max(0, opts.frost).toFixed(1)}px) brightness(110%)`,
                }),
                registerGlassComponent({
                        effect: 'polished',
                        tagName,
                        defaults: {
                                blur: 0.35,
                                frost: 6,
                                dispersion: 0.6,
                                channels: { r: 0.9, g: 0.4, b: -0.6 },
                                noise: 'high',
                                specular: 0.55,
                                specSrc: DEFAULT_SPEC_SRC,
                        },
                        createStages: (opts) => {
                                const stages: Stage[] = [];
                                stages.push(blur(Math.max(0.01, opts.blur)));
                                stages.push(noiseBlur('high', Math.max(0.05, opts.blur)));
                                stages.push(chromatic);
                                stages.push(specular(Math.max(0, opts.specular)));
                                return stages;
                        },
                        backdrop: (opts) => `blur(${Math.max(0, opts.frost).toFixed(1)}px) contrast(105%)`,
                        filterFrame: {
                                x: '-40%',
                                y: '-40%',
                                width: '180%',
                                height: '180%',
                        },
                }),
                registerGlassComponent({
                        effect: 'aurora',
                        tagName,
                        defaults: {
                                blur: 0.85,
                                frost: 22,
                                dispersion: 3.4,
                                channels: { r: 1.4, g: 0.2, b: -1.25 },
                                noise: 'low',
                                specular: 0.42,
                                specSrc: DEFAULT_SPEC_SRC,
                        },
                        createStages: (opts) => {
                                const stages: Stage[] = [];
                                stages.push(blur(Math.max(0.01, opts.blur)));
                                stages.push(noiseBlur('low', Math.max(0.05, opts.blur * 0.85)));
                                stages.push(chromatic);
                                stages.push(specular(Math.max(0, opts.specular)));
                                return stages;
                        },
                        backdrop: (opts) => `blur(${Math.max(0, opts.frost).toFixed(1)}px) saturate(135%) brightness(1.1)`,
                        filterFrame: {
                                x: '-55%',
                                y: '-55%',
                                width: '210%',
                                height: '210%',
                        },
                }),
        ];
        return results.map(r => r.config.effect);
}

export function listRegisteredGlassEffects() {
        return Array.from(effectRegistry.keys());
}