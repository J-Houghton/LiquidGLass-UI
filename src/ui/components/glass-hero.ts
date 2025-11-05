import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";

import "./toggle-group";
import "./controls";
import type { HeroMode } from "./controls";

const DEFAULTS = {
        grid: "#1f2937",
        a: "#2b2bff",
        b: "#00d4ff",
        c: "#00ffa3",
        photo: "https://images.unsplash.com/photo-1500964757637-c85e8a162699",
        photos: [
                "https://images.unsplash.com/photo-1500964757637-c85e8a162699",
                "https://plus.unsplash.com/premium_photo-1710193817276-5ebc79f46714",
                "https://images.unsplash.com/photo-1501908734255-16579c18c25f",
                "https://images.unsplash.com/photo-1491466424936-e304919aada7",
        ],
};

@customElement("glass-hero")
export class GlassHero extends LitElement {
        static styles = css`
                :host {
                        display: grid;
                        gap: 10px;
                }

                .stage {
                        position: relative;
                        height: 360px;
                        border-radius: 24px;
                        overflow: hidden;
                        isolation: isolate;
                        background: color-mix(in oklch, CanvasText, transparent 97%);
                }

                .stage[data-mode="moving"] {
                        background: linear-gradient(135deg, var(--gradA), var(--gradB), var(--gradC));
                }

                .grad,
                .grid {
                        position: absolute;
                        inset: 0;
                }

                .grad {
                        inset: -20% -20%;
                        background: linear-gradient(135deg, var(--gradA), var(--gradB), var(--gradC));
                }

                .grid {
                        background:
                                repeating-linear-gradient(90deg, var(--grid) 0 1px, #0000 1px 24px),
                                repeating-linear-gradient(0deg, var(--grid) 0 1px, #0000 1px 24px);
                        background-position: 0 0, 0 0;
                        opacity: 0.22;
                        animation: grid-scroll var(--grid-dur, 0.5s) linear infinite;
                        animation-play-state: var(--grid-play, running);
                }

                @keyframes grid-scroll {
                        from {
                                background-position: 0 0, 0 0;
                        }

                        to {
                                background-position: 0 24px, 0 24px;
                        }
                }

                .photo {
                        position: absolute;
                        inset: 0;
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                }

                .icons {
                        position: absolute;
                        inset: 0;
                        display: grid;
                        place-items: center;
                        pointer-events: none;
                        opacity: 0;
                        transition: opacity 0.2s ease;
                }

                .icons[data-show="true"] {
                        opacity: 1;
                }

                .dock {
                        display: grid;
                        grid-template-columns: repeat(5, 80px);
                        grid-auto-rows: 80px;
                        gap: 1rem 2rem;
                }

                .dock img {
                        width: 80px;
                        aspect-ratio: 1;
                        border-radius: 18px;
                }
        `;

        @property({ type: String, reflect: true }) mode: HeroMode = "static";

        @property({ type: String }) grid = DEFAULTS.grid;

        @property({ type: String, attribute: "grada" }) grada = DEFAULTS.a;

        @property({ type: String, attribute: "gradb" }) gradb = DEFAULTS.b;

        @property({ type: String, attribute: "gradc" }) gradc = DEFAULTS.c;

        @property({ type: String }) photo = DEFAULTS.photo;

        @property({ attribute: false }) photos: string[] = [...DEFAULTS.photos];

        @state() private showIcons = false;

        @state() private gridDuration = "";

        @state() private gridPlay = "running";

        @state() private speed = 1.0;

        protected firstUpdated(): void {
                // ensure defaults pick up any initial attributes supplied before upgrade
                this.grid ||= DEFAULTS.grid;
                this.grada ||= DEFAULTS.a;
                this.gradb ||= DEFAULTS.b;
                this.gradc ||= DEFAULTS.c;
                this.photo ||= DEFAULTS.photo;
        }

        protected updated(changed: Map<string | number | symbol, unknown>): void {
                if (changed.has("mode") && this.mode === "moving" && !this.gridDuration) {
                        this.gridDuration = "1.00s";
                        this.gridPlay = "running";
                }

                if (changed.has("mode") && this.mode === "moving") {
                        this.showIcons = false;
                }
        }

        private handleModeChange(event: CustomEvent<{ mode: HeroMode }>): void {
                if (event.detail.mode === this.mode) return;
                this.mode = event.detail.mode;
        }

        private handlePhotoChange(event: CustomEvent<{ url: string }>): void {
                if (event.detail.url === this.photo) return;
                this.photo = event.detail.url;
        }

        private handleIconsToggle(event: CustomEvent<{ show: boolean }>): void {
                this.showIcons = event.detail.show;
        }

        private handleColorChange(event: CustomEvent<{ grid: string; a: string; b: string; c: string }>): void {
                const { grid, a, b, c } = event.detail;
                this.grid = grid;
                this.grada = a;
                this.gradb = b;
                this.gradc = c;
        }

        private handleSpeedChange(event: CustomEvent<{ speed: number }>): void {
                const factor = Math.max(0, Math.min(3, event.detail.speed));
                const base = 1;
                const dur = factor <= 0.001 ? base : base / factor;
                this.gridDuration = `${dur.toFixed(2)}s`;
                this.gridPlay = factor === 0 ? "paused" : "running";
                this.speed = factor;
        }

        render() {
                const moving = this.mode === "moving";
                const iconsVisible = !moving && this.showIcons;
                const stageStyles = styleMap({
                        "--grid": this.grid,
                        "--gradA": this.grada,
                        "--gradB": this.gradb,
                        "--gradC": this.gradc,
                        "--grid-dur": this.gridDuration || undefined,
                        "--grid-play": this.gridPlay || undefined,
                });

                return html`
                        <div class="stage" data-mode=${this.mode} style=${stageStyles}>
                                <div class="grad" ?hidden=${!moving}></div>
                                <div class="grid" ?hidden=${!moving}></div>
                                <img class="photo" alt="Selected background" src=${this.photo} ?hidden=${moving} />
                                <div class="icons" data-show=${String(iconsVisible)} aria-hidden=${iconsVisible ? "false" : "true"}>
                                        <div class="dock">
                                                <img src="https://assets.codepen.io/605876/finder.png" alt="Finder" />
                                                <img src="https://assets.codepen.io/605876/launch-control.png" alt="Launch Control" />
                                                <img src="https://assets.codepen.io/605876/safari.png" alt="Safari" />
                                                <img src="https://assets.codepen.io/605876/calendar.png" alt="Calendar" />
                                                <img src="https://assets.codepen.io/605876/photos.png" alt="Photos" />
                                                <img src="https://assets.codepen.io/605876/signal.png" alt="Signal" />
                                                <img src="https://assets.codepen.io/605876/spotify.png" alt="Spotify" />
                                                <img src="https://assets.codepen.io/605876/brave.png" alt="Brave" />
                                                <img src="https://assets.codepen.io/605876/raycast.png" alt="Raycast" />
                                                <img src="https://assets.codepen.io/605876/screenstudio.png" alt="Screen" />
                                        </div>
                                </div>
                        </div>
                        <lg-controls
                                .mode=${this.mode}
                                .photos=${this.photos}
                                .photo=${this.photo}
                                .grid=${this.grid}
                                .grada=${this.grada}
                                .gradb=${this.gradb}
                                .gradc=${this.gradc}
                                .showIcons=${this.showIcons}
                                .speed=${this.speed}
                                @modechange=${this.handleModeChange}
                                @photochange=${this.handlePhotoChange}
                                @iconstoggle=${this.handleIconsToggle}
                                @colorchange=${this.handleColorChange}
                                @speedchange=${this.handleSpeedChange}
                        ></lg-controls>
                `;
        }
}

declare global {
        interface HTMLElementTagNameMap {
                "glass-hero": GlassHero;
        }
}
