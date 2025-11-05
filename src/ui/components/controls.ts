import Pickr from "@simonwep/pickr";
import { css, html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators.js";

export type HeroMode = "static" | "moving";

type ColorDetail = { grid: string; a: string; b: string; c: string };

@customElement("lg-controls")
export class LGControls extends LitElement {
        static styles = css`
                :host {
                        display: block;
                }

                .controls {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        align-items: center;
                        justify-content: space-between;
                        padding-top: 6px;
                }

                .row {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                        flex-wrap: wrap;
                }

                .hint {
                        color: var(--muted, color-mix(in oklch, CanvasText, transparent 40%));
                }

                .thumbs {
                        display: flex;
                        gap: 8px;
                }

                .thumbs button {
                        width: 54px;
                        height: 54px;
                        border-radius: 12px;
                        border: 2px solid transparent;
                        padding: 0;
                        overflow: hidden;
                        cursor: pointer;
                        background: transparent;
                }

                .thumbs button[aria-pressed="true"] {
                        border-color: var(--ring, #60a5fa);
                }

                .thumbs img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        display: block;
                }

                .chip {
                        padding: 0.45rem 0.75rem;
                        border-radius: 999px;
                        border: 1px solid color-mix(in oklch, CanvasText, transparent 80%);
                        background: color-mix(in oklch, CanvasText, transparent 92%);
                        cursor: pointer;
                }

                .chip[aria-pressed="true"] {
                        border-color: color-mix(in oklch, CanvasText, transparent 65%);
                }

                .toggle {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.5rem;
                        color: var(--muted);
                }

                .color {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        padding: 0.35rem 0.5rem;
                        border: 1px solid color-mix(in oklch, CanvasText, transparent 85%);
                        border-radius: 999px;
                        background: transparent;
                }

                #movingControls[hidden],
                #staticControls[hidden] {
                        display: none !important;
                }
        `;

        @property({ type: String, reflect: true }) mode: HeroMode = "static";

        @property({ attribute: false }) photos: string[] = [];

        @property({ type: String }) photo = "";

        @property({ type: String }) grid = "#1f2937";

        @property({ type: String }) grada = "#2b2bff";

        @property({ type: String }) gradb = "#00d4ff";

        @property({ type: String }) gradc = "#00ffa3";

        @property({ type: Boolean, attribute: "show-icons", reflect: true }) showIcons = false;

        @property({ type: Number }) speed = 1.0;

        @query("#modeGroup") private modeGroup?: HTMLElement & { value?: string };

        @query("#pickr-grid") private pickrGridEl?: HTMLElement;

        @query("#pickr-a") private pickrAEl?: HTMLElement;

        @query("#pickr-b") private pickrBEl?: HTMLElement;

        @query("#pickr-c") private pickrCEl?: HTMLElement;

        private prGrid?: Pickr;

        private prA?: Pickr;

        private prB?: Pickr;

        private prC?: Pickr;

        private readonly togglePicker = (picker?: Pickr) => {
                if (!picker) return;
                picker.isOpen() ? picker.hide() : picker.show();
        };

        protected firstUpdated(): void {
                this.initPickers();
                if (this.modeGroup) {
                        this.modeGroup.value = this.mode;
                }
        }

        protected updated(changed: Map<string | number | symbol, unknown>): void {
                if (changed.has("mode") && this.modeGroup) {
                        this.modeGroup.value = this.mode;
                }

                if (changed.has("grid")) {
                        this.prGrid?.setColor(this.grid, true);
                }

                if (changed.has("grada")) {
                        this.prA?.setColor(this.grada, true);
                }

                if (changed.has("gradb")) {
                        this.prB?.setColor(this.gradb, true);
                }

                if (changed.has("gradc")) {
                        this.prC?.setColor(this.gradc, true);
                }

                if (changed.has("photos")) {
                        if (!this.photo && this.photos.length) {
                                this.photo = this.photos[0];
                        } else if (this.photo && this.photos.length && !this.photos.includes(this.photo)) {
                                this.photo = this.photos[0] ?? "";
                        }
                }
        }

        private handleModeChange(event: Event): void {
                const value = (event as CustomEvent).detail?.value as HeroMode | undefined;
                if (!value || value === this.mode) return;
                this.mode = value;
                this.dispatchEvent(new CustomEvent("modechange", { detail: { mode: value } }));
        }

        private handlePhotoSelect(url: string): void {
                if (this.photo === url) return;
                this.photo = url;
                this.dispatchEvent(new CustomEvent("photochange", { detail: { url } }));
        }

        private handleIconsToggle(event: Event): void {
                const target = event.target as HTMLInputElement | null;
                if (!target) return;
                const show = target.checked;
                this.showIcons = show;
                this.dispatchEvent(new CustomEvent("iconstoggle", { detail: { show } }));
        }

        private handleSpeedInput(event: Event): void {
                const value = parseFloat((event.target as HTMLInputElement).value);
                this.speed = Number.isFinite(value) ? value : this.speed;
                this.dispatchEvent(new CustomEvent("speedchange", { detail: { speed: this.speed } }));
        }

        private initPickers(): void {
                const create = (el: HTMLElement | undefined | null, defaultColor: string) => {
                        if (!el) return undefined;
                        return Pickr.create({
                                el,
                                theme: "nano",
                                default: defaultColor,
                                components: {
                                        preview: true,
                                        opacity: true,
                                        hue: true,
                                        interaction: { input: true, save: true, clear: false },
                                },
                        });
                };

                this.prGrid = create(this.pickrGridEl, this.grid);
                this.prA = create(this.pickrAEl, this.grada);
                this.prB = create(this.pickrBEl, this.gradb);
                this.prC = create(this.pickrCEl, this.gradc);

                [this.prGrid, this.prA, this.prB, this.prC]
                        .filter((p): p is Pickr => Boolean(p))
                        .forEach(p =>
                                p
                                        .on("init", () => this.emitColors())
                                        .on("save", () => this.emitColors())
                                        .on("change", () => this.emitColors()),
                        );
        }

        private getColor(picker: Pickr | undefined, fallback: string): string {
                const color = picker?.getSelectedColor?.() ?? picker?.getColor?.();
                return color ? color.toHEXA().toString() : fallback;
        }

        private emitColors(): void {
                const detail: ColorDetail = {
                        grid: this.getColor(this.prGrid, this.grid),
                        a: this.getColor(this.prA, this.grada),
                        b: this.getColor(this.prB, this.gradb),
                        c: this.getColor(this.prC, this.gradc),
                };

                this.grid = detail.grid;
                this.grada = detail.a;
                this.gradb = detail.b;
                this.gradc = detail.c;

                this.dispatchEvent(new CustomEvent("colorchange", { detail }));
        }

        disconnectedCallback(): void {
                [this.prGrid, this.prA, this.prB, this.prC].forEach(p => p?.destroyAndRemove?.());
                super.disconnectedCallback();
        }

        render() {
                const moving = this.mode === "moving";
                const selectedPhoto = this.photo || this.photos[0] || "";

                return html`
                        <link
                                rel="stylesheet"
                                href="https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/nano.min.css"
                        />
                        <div class="controls">
                                <div class="row" aria-label="Background mode">
                                        <span class="hint">Background:</span>
                                        <toggle-group
                                                id="modeGroup"
                                                class="seg"
                                                .value=${this.mode}
                                                @change=${this.handleModeChange}
                                        >
                                                <button class="chip" data-value="static" aria-pressed=${this.mode === "static"}>
                                                        Static
                                                </button>
                                                <button class="chip" data-value="moving" aria-pressed=${this.mode === "moving"}>
                                                        Moving
                                                </button>
                                        </toggle-group>
                                </div>

                                <div class="row" id="staticControls" ?hidden=${moving}>
                                        <div class="thumbs" role="group" aria-label="Choose photo">
                                                ${this.photos.map(
                                                        (url, index) => html`
                                                                <button
                                                                        aria-pressed=${selectedPhoto === url}
                                                                        data-photo=${url}
                                                                        @click=${() => this.handlePhotoSelect(url)}
                                                                >
                                                                        <img src=${url} alt=${`Scenery ${index + 1}`} />
                                                                </button>
                                                        `,
                                                )}
                                        </div>
                                        <label class="toggle" title="Show app icons over static photo">
                                                <input
                                                        id="toggleIcons"
                                                        type="checkbox"
                                                        .checked=${this.showIcons}
                                                        @change=${this.handleIconsToggle}
                                                />
                                                Show app icons
                                        </label>
                                </div>

                                <div class="row" id="movingControls" ?hidden=${!moving}>
                                        <span class="hint">Colors:</span>
                                        <div class="color">
                                                Grid
                                                <span
                                                        id="pickr-grid"
                                                        role="button"
                                                        tabindex="0"
                                                        aria-label="Pick grid color"
                                                        @click=${() => this.togglePicker(this.prGrid)}
                                                ></span>
                                        </div>
                                        <div class="color">
                                                A
                                                <span id="pickr-a" @click=${() => this.togglePicker(this.prA)}></span>
                                        </div>
                                        <div class="color">
                                                B
                                                <span id="pickr-b" @click=${() => this.togglePicker(this.prB)}></span>
                                        </div>
                                        <div class="color">
                                                C
                                                <span id="pickr-c" @click=${() => this.togglePicker(this.prC)}></span>
                                        </div>
                                        <label class="color" style="gap: 10px">
                                                <span>Grid speed</span>
                                                <input
                                                        id="speed"
                                                        type="range"
                                                        min="0.00"
                                                        max="3.00"
                                                        step="0.01"
                                                        .value=${this.speed.toFixed(2)}
                                                        @input=${this.handleSpeedInput}
                                                        @change=${this.handleSpeedInput}
                                                />
                                                <output style="min-width: 3ch; text-align: right">
                                                        ${(this.speed * 100).toFixed(0)}%
                                                </output>
                                        </label>
                                </div>
                        </div>
                `;
        }
}

declare global {
        interface HTMLElementTagNameMap {
                "lg-controls": LGControls;
        }
}
