import { LitElement, css, html, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';
import { build, clearDynamic, type Stage } from '../filters/core';
import { blur } from '../filters/blur';
import { chromatic } from '../filters/chromatic';
import { noiseBlur } from '../filters/noiseBlur';
import { specular } from '../filters/specularFilter';
import { driveRgbOffsets } from '../fx/rgbSplit';
import { imageDataToBlobURL } from '../fx/filterCache';
import type { State } from '../glass/effectState';
import { calculateDisplacementMap } from '../optics/disp1d';
import { calculateDisplacementMap2 } from '../optics/disp2d';
import { buildSpecularImage } from '../optics/specularLight';
import { SURFACE_FNS, type SurfaceKind } from '../optics/surfaces';
import { validate } from '../validation/geometry';

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
        /** Optional geometry + lighting state used to drive the displacement/specular textures. */
        state?: State;
}
export interface CreateGlassElementOptions extends GlassComponentInit {
        tagName?: string;
        classes?: string | string[];
        attributes?: Record<string, string>;
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
const liveInstances = new Set<GlassComponentElement>();

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

type GeometrySnapshot = {
        width: number;
        height: number;
        radius: number;
        bezelWidth: number;
        thickness: number;
        surface: SurfaceKind;
        refractiveIndex: number;
        scale: number;
        showSpecular: boolean;
        specularAngleDeg: number;
        specularStrength: number;
};

function toGeometrySnapshot(state: State): GeometrySnapshot {
        const validated = validate({
                width: state.width,
                height: state.height,
                radius: state.radius,
                bezelWidth: state.bezelWidth,
                glassThickness: state.glassThickness,
                surface: state.surface,
        });
        return {
                width: validated.width,
                height: validated.height,
                radius: validated.radius,
                bezelWidth: validated.bezelWidth,
                thickness: validated.glassThickness_eff,
                surface: validated.surface,
                refractiveIndex: state.refractiveIndex,
                scale: state.scale_px,
                showSpecular: !!state.showSpecular && state.specularStrength > 0,
                specularAngleDeg: state.specularAngleDeg,
                specularStrength: Math.max(0, state.specularStrength),
        };
}

function geometrySignature(snapshot: GeometrySnapshot) {
        const round = (value: number, digits: number) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : 0);
        return JSON.stringify({
                w: round(snapshot.width, 2),
                h: round(snapshot.height, 2),
                r: round(snapshot.radius, 2),
                b: round(snapshot.bezelWidth, 2),
                t: round(snapshot.thickness, 3),
                surf: snapshot.surface,
                ior: round(snapshot.refractiveIndex, 4),
                spec: snapshot.showSpecular
                        ? { a: round(snapshot.specularAngleDeg, 2), s: round(snapshot.specularStrength, 3) }
                        : null,
        });
}

async function renderGeometryTextures(snapshot: GeometrySnapshot) {
        const surface = SURFACE_FNS[snapshot.surface] ?? SURFACE_FNS.convex_circle;
        const disp1D = calculateDisplacementMap(
                snapshot.thickness,
                snapshot.bezelWidth,
                surface.fn,
                snapshot.refractiveIndex,
                512,
        );
        const maxAbs = disp1D.reduce((m, value) => Math.max(m, Math.abs(value)), 0);
        const norm = Math.max(1, maxAbs);
        const disp2D = calculateDisplacementMap2(
                snapshot.width,
                snapshot.height,
                snapshot.radius,
                snapshot.bezelWidth,
                norm,
                disp1D,
        );
        const mapUrl = await imageDataToBlobURL(disp2D);
        let specUrl: string | null = null;
        if (snapshot.showSpecular) {
                const specImg = buildSpecularImage(
                        snapshot.width,
                        snapshot.height,
                        snapshot.radius,
                        snapshot.bezelWidth,
                        snapshot.specularAngleDeg,
                        snapshot.specularStrength,
                );
                specUrl = await imageDataToBlobURL(specImg);
        }
        return { mapUrl, specUrl };
}

function parseAttributeOptions(el: GlassComponentElement): Partial<GlassEffectOptions> {
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
export function createGlassElement(init: CreateGlassElementOptions = {}) {
        const tagName = init.tagName ?? 'glass-card';
        ensureTagDefined(tagName);
        const element = document.createElement(tagName) as GlassComponent;
        if (init.effect) element.effect = init.effect;
        if (init.options) element.options = init.options;
        if (init.classes) {
                const classes = Array.isArray(init.classes)
                        ? init.classes
                        : String(init.classes)
                                .split(/\s+/)
                                .filter(Boolean);
                if (classes.length) element.classList.add(...classes);
        }
        if (init.attributes) {
                Object.entries(init.attributes).forEach(([key, value]) => {
                        element.setAttribute(key, value);
                });
        }
        if (init.state) element.state = init.state;
        return element;
}
export class GlassComponentElement extends LitElement {
        static override styles = css`
                :host {
                        --glass-width: 320px;
                        --glass-height: 240px;
                        --glass-radius: 24px;
                        --glass-border-width: 0px;
                        display: block;
                        position: relative;
                        width: var(--glass-width);
                        height: var(--glass-height);
                        border-radius: var(--glass-radius);
                        contain: layout style;
                }

                .wrapper {
                        position: relative;
                        display: block;
                        width: var(--glass-width);
                        height: var(--glass-height);
                        border-radius: var(--glass-radius);
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
                        width: 100%;
                        height: 100%;
                        border-radius: var(--glass-radius);
                        border-style: solid;
                        border-width: var(--glass-border-width);
                        border-color: transparent;
                        overflow: hidden;
                        filter: none;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0);
                }

                .optics {
                        position: absolute;
                        inset: 0;
                        border-radius: var(--glass-radius);
                        filter: none;
                        background: inherit;
                        pointer-events: none;
                        z-index: 0;
                }

                .backdrop {
                        position: absolute;
                        inset: 0;
                        border-radius: var(--glass-radius);
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
        `;

        static override get observedAttributes(): string[] {
                const base = super.observedAttributes ?? [];
                const extras = [
                        'effect',
                        'blur',
                        'frost',
                        'dispersion',
                        'noise-kind',
                        'specular',
                        'spec-src',
                        'dispersion-r',
                        'dispersion-g',
                        'dispersion-b',
                ];
                return Array.from(new Set([...base, ...extras]));
        }

        @property({ type: String, reflect: true })
        get effect(): string {
                return this._effect;
        }
        set effect(value: string) {
                const old = this._effect;
                const normalized = value ?? '';
                if (old === normalized) return;
                this._effect = normalized;
                this.refreshPending = true;
                this.geometryUpdatePending = true;
                this.requestUpdate('effect', old);
        }

        @property({ attribute: false })
        get options(): Partial<GlassEffectOptions> | undefined {
                return this.cloneOverrides(this.optionOverrides);
        }
        set options(value: Partial<GlassEffectOptions> | undefined) {
                const old = this.optionOverrides;
                this.optionOverrides = this.cloneOverrides(value);
                this.refreshPending = true;
                this.geometryUpdatePending = true;
                this.requestUpdate('options', old);
        }

        @property({ attribute: false })
        get state(): State | null {
                return this.geometryState ? { ...this.geometryState } : null;
        }
        set state(value: State | null) {
                const old = this.geometryState ? { ...this.geometryState } : null;
                if (value) {
                        this.geometryState = { ...value };
                } else {
                        this.geometryState = null;
                        this.geometryKey = null;
                        this.releaseMapUrl();
                        this.releaseSpecUrl();
                        this.resetSnapshotDimensions();
                        if (this.dispEl) this.dispEl.setAttribute('scale', '0');
                }
                this.refreshPending = true;
                this.geometryUpdatePending = true;
                this.requestUpdate('state', old);
        }

        @query('filter')
        private filterEl?: SVGFilterElement;

        @query('.optics')
        private opticsEl?: HTMLElement;

        @query('.backdrop')
        private backdropEl?: HTMLElement;

        @query('feImage[result="map"]')
        private mapImageEl?: SVGImageElement;

        @query('#disp')
        private dispEl?: SVGFEDisplacementMapElement;

        @query('#specImage')
        private specImageEl?: SVGImageElement;

        private readonly filterId: string;
        private readonly initialEffect?: string;
        private _effect = '';
        private optionOverrides: Partial<GlassEffectOptions> | undefined;
        private geometryState: State | null = null;
        private geometryKey: string | null = null;
        private mapUrl: string | null = null;
        private specUrl: string | null = null;
        private resolvedSpecSrc: string | null = null;
        private geometryTaskId = 0;
        private refreshPending = true;
        private geometryUpdatePending = true;
        private filterApplied = false;

        constructor(init?: GlassComponentInit) {
                super();
                this.filterId = `glass-filter-${++instanceCounter}`;
                this.initialEffect = init?.effect;
                if (init?.effect) {
                        this._effect = init.effect;
                }
                if (init?.options) {
                        this.optionOverrides = this.cloneOverrides(init.options);
                }
                if (init?.state) {
                        this.geometryState = { ...init.state };
                }
        }

        override connectedCallback() {
                super.connectedCallback();
                liveInstances.add(this);
                this.refreshPending = true;
                this.geometryUpdatePending = true;
        }

        override disconnectedCallback() {
                liveInstances.delete(this);
                this.releaseMapUrl();
                this.releaseSpecUrl();
                super.disconnectedCallback();
        }

        override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
                if (oldValue === newValue) return;
                super.attributeChangedCallback(name, oldValue, newValue);
                this.refreshPending = true;
                this.geometryUpdatePending = true;
                this.requestUpdate();
        }

        refresh() {
                this.refreshPending = true;
                this.geometryUpdatePending = true;
                this.requestUpdate();
        }

        protected override updated(changedProperties: PropertyValues<this>) {
                super.updated(changedProperties);
                if (this.opticsEl && !this.filterApplied) {
                        this.opticsEl.style.filter = `url(#${this.filterId})`;
                        this.filterApplied = true;
                }
                if (!this.isConnected) return;
                const geometryWasPending = this.geometryUpdatePending;
                if (this.refreshPending) {
                        this.refreshPending = false;
                        const applied = this.applyEffect();
                        if (applied) {
                                this.geometryUpdatePending = true;
                        } else {
                                this.geometryUpdatePending = geometryWasPending;
                        }
                }
                if (this.geometryUpdatePending) {
                        this.geometryUpdatePending = false;
                        void this.updateGeometryTextures();
                }
        }

        protected override render() {
                return html`
                        <div class="wrapper">
                                <svg aria-hidden="true" focusable="false">
                                        <defs>
                                                <filter
                                                        id=${this.filterId}
                                                        filterUnits="objectBoundingBox"
                                                        x=${DEFAULT_FILTER_FRAME.x ?? ''}
                                                        y=${DEFAULT_FILTER_FRAME.y ?? ''}
                                                        width=${DEFAULT_FILTER_FRAME.width ?? ''}
                                                        height=${DEFAULT_FILTER_FRAME.height ?? ''}
                                                        color-interpolation-filters="sRGB"
                                                >
                                                        <feImage
                                                                x="0"
                                                                y="0"
                                                                width="100%"
                                                                height="100%"
                                                                preserveAspectRatio="none"
                                                                result="map"
                                                        ></feImage>
                                                        <feDisplacementMap
                                                                in="SourceGraphic"
                                                                in2="map"
                                                                id="disp"
                                                                xChannelSelector="R"
                                                                yChannelSelector="G"
                                                                scale="0"
                                                                result="refr"
                                                        ></feDisplacementMap>
                                                        <feImage
                                                                x="0"
                                                                y="0"
                                                                width="100%"
                                                                height="100%"
                                                                preserveAspectRatio="none"
                                                                id="specImage"
                                                                result="specSrc"
                                                        ></feImage>
                                                </filter>
                                        </defs>
                                </svg>
                                <div class="surface" part="surface">
                                        <div class="optics">
                                                <div class="backdrop" part="backdrop"></div>
                                        </div>
                                        <slot></slot>
                                </div>
                        </div>
                `;
        }

        private get resolvedEffectName() {
                return this._effect || this.initialEffect || defaultEffectName || '';
        }

        private cloneOverrides(overrides?: Partial<GlassEffectOptions>) {
                if (!overrides) return undefined;
                const clone: Partial<GlassEffectOptions> = { ...overrides };
                if (overrides.channels) {
                        clone.channels = { ...overrides.channels };
                }
                return clone;
        }

        private applyEffect() {
                if (!this.filterEl || !this.opticsEl || !this.backdropEl) return false;
                const effectName = this.resolvedEffectName;
                const internal = effectRegistry.get(effectName) ?? (defaultEffectName ? effectRegistry.get(defaultEffectName) : undefined);
                if (!internal) return false;
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
                this.resolvedSpecSrc = resolved.specSrc ?? DEFAULT_SPEC_SRC;
                if (this.specImageEl) {
                        this.specImageEl.setAttribute('href', this.resolvedSpecSrc);
                }
                this.applyDispersion(resolved);
                return true;
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

        private updateMapUrl(url: string | null) {
                if (this.mapUrl && this.mapUrl !== url) URL.revokeObjectURL(this.mapUrl);
                this.mapUrl = url;
                if (this.mapImageEl) {
                        if (url) this.mapImageEl.setAttribute('href', url);
                        else this.mapImageEl.removeAttribute('href');
                }
        }

        private releaseMapUrl() {
                this.updateMapUrl(null);
        }

        private updateSpecUrl(url: string | null) {
                if (this.specUrl && this.specUrl !== url) URL.revokeObjectURL(this.specUrl);
                this.specUrl = url;
                if (!this.specImageEl) return;
                if (url) {
                        this.specImageEl.setAttribute('href', url);
                } else if (this.resolvedSpecSrc) {
                        this.specImageEl.setAttribute('href', this.resolvedSpecSrc);
                } else {
                        this.specImageEl.removeAttribute('href');
                }
        }

        private releaseSpecUrl() {
                this.updateSpecUrl(null);
        }

        private applySnapshot(snapshot: GeometrySnapshot) {
                const width = Number.isFinite(snapshot.width) ? `${snapshot.width}px` : null;
                const height = Number.isFinite(snapshot.height) ? `${snapshot.height}px` : null;
                const radius = Number.isFinite(snapshot.radius) ? `${snapshot.radius}px` : null;
                const borderWidth = Number.isFinite(snapshot.bezelWidth) ? `${snapshot.bezelWidth}px` : null;
                if (width) this.style.setProperty('--glass-width', width);
                if (height) this.style.setProperty('--glass-height', height);
                if (radius) this.style.setProperty('--glass-radius', radius);
                if (borderWidth) this.style.setProperty('--glass-border-width', borderWidth);
                if (this.dispEl) {
                        this.dispEl.setAttribute('xChannelSelector', 'R');
                        this.dispEl.setAttribute('yChannelSelector', 'G');
                        const scale = Number.isFinite(snapshot.scale) ? snapshot.scale : 0;
                        this.dispEl.setAttribute('scale', scale.toFixed(2));
                }
                if (this.mapImageEl) {
                        if (this.mapUrl) this.mapImageEl.setAttribute('href', this.mapUrl);
                        else this.mapImageEl.removeAttribute('href');
                }
                if (this.specImageEl) {
                        if (this.specUrl) this.specImageEl.setAttribute('href', this.specUrl);
                        else if (this.resolvedSpecSrc) this.specImageEl.setAttribute('href', this.resolvedSpecSrc);
                }
        }

        private async updateGeometryTextures() {
                if (!this.isConnected) return;
                if (!this.filterEl) return;
                if (!this.geometryState) {
                        this.releaseMapUrl();
                        this.releaseSpecUrl();
                        this.resetSnapshotDimensions();
                        this.geometryKey = null;
                        if (this.dispEl) this.dispEl.setAttribute('scale', '0');
                        return;
                }
                const snapshot = toGeometrySnapshot(this.geometryState);
                const signature = geometrySignature(snapshot);
                if (signature === this.geometryKey) {
                        this.applySnapshot(snapshot);
                        return;
                }
                const taskId = ++this.geometryTaskId;
                const { mapUrl, specUrl } = await renderGeometryTextures(snapshot);
                if (!this.isConnected) {
                        URL.revokeObjectURL(mapUrl);
                        if (specUrl) URL.revokeObjectURL(specUrl);
                        return;
                }
                if (!this.geometryState) {
                        URL.revokeObjectURL(mapUrl);
                        if (specUrl) URL.revokeObjectURL(specUrl);
                        return;
                }
                const latestSnapshot = toGeometrySnapshot(this.geometryState);
                const latestSignature = geometrySignature(latestSnapshot);
                if (taskId !== this.geometryTaskId || latestSignature !== signature) {
                        URL.revokeObjectURL(mapUrl);
                        if (specUrl) URL.revokeObjectURL(specUrl);
                        return;
                }
                this.updateMapUrl(mapUrl);
                this.updateSpecUrl(specUrl ?? null);
                this.geometryKey = signature;
                this.applySnapshot(latestSnapshot);
        }

        private resetSnapshotDimensions() {
                this.style.removeProperty('--glass-width');
                this.style.removeProperty('--glass-height');
                this.style.removeProperty('--glass-radius');
                this.style.removeProperty('--glass-border-width');
        }
}

export class GlassComponent extends GlassComponentElement {}

export function registerDefaultGlassEffects(tagName = 'glass-card') {
        const results = [
                registerGlassComponent({
                        effect: 'frosted',
                        tagName,
                        defaults: {
                                blur: 0,
                                frost: 0,
                                dispersion: 0,
                                channels: { r: 1.0, g: 0.25, b: -0.9 },
                                noise: 'low',
                                specular: 1,
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
                                blur: 0,
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
                                blur: 0,
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
                                blur: 0,
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