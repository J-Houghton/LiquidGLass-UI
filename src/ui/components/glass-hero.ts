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

export class GlassHero extends HTMLElement {
  private root: ShadowRoot;
  private stage!: HTMLElement;
  private photo!: HTMLImageElement;
  private icons!: HTMLElement;
  private controls!: HTMLElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.cache();
    this.seed();
    this.listen();
    this.setMode((this.getAttribute("mode") as HeroMode) ?? "static");
  }

  private html() {
    const grid  = this.getAttribute("grid")  ?? DEFAULTS.grid;
    const grada = this.getAttribute("grada") ?? DEFAULTS.a;
    const gradb = this.getAttribute("gradb") ?? DEFAULTS.b;
    const gradc = this.getAttribute("gradc") ?? DEFAULTS.c;
    const photo = this.getAttribute("photo") ?? DEFAULTS.photo;
    const mode  = (this.getAttribute("mode") as HeroMode) ?? "static";

    return /*html*/`
      <style>
        :host { display:grid; gap:10px }
        .stage { position:relative; height:360px; border-radius:24px; overflow:hidden; isolation:isolate;
                 background: color-mix(in oklch, CanvasText, transparent 97%) }
        .stage[data-mode="moving"] { background: linear-gradient(135deg, var(--gradA), var(--gradB), var(--gradC)) }
        .grad, .grid { position:absolute; inset:0 }
        .grad { inset:-20% -20%; animation: pan 16s linear infinite;
                background: linear-gradient(135deg, var(--gradA), var(--gradB), var(--gradC)) }
        @keyframes pan { from { transform: translateX(-10%) rotate(0.001deg) } to { transform: translateX(10%) rotate(0.001deg) } }
        .grid { background: repeating-linear-gradient(90deg, var(--grid) 0 1px, #0000 1px 24px),
                               repeating-linear-gradient(0deg, var(--grid) 0 1px, #0000 1px 24px);
                opacity:.22; animation: drift 12s linear infinite }
        @keyframes drift { from { transform: translateY(0) } to { transform: translateY(24px) } }
        .photo { position:absolute; inset:0; width:100%; height:100%; object-fit:cover }
        .icons { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; opacity:0; transition:opacity .2s ease }
        .icons[data-show="true"]{ opacity:1 }
        .dock { display:grid; grid-template-columns:repeat(5, 80px); grid-auto-rows:80px; gap:1rem 2rem }
        .dock img { width:80px; aspect-ratio:1; border-radius:18px }
      </style>

      <div class="stage" id="stage" data-mode="${mode}"
           style="--grid:${grid}; --gradA:${grada}; --gradB:${gradb}; --gradC:${gradc};">
        <div class="grad" hidden></div>
        <div class="grid" hidden></div>
        <img class="photo" id="heroPhoto" alt="Selected background" src="${photo}">
        <div class="icons" id="icons" data-show="false" aria-hidden="true">
          <div class="dock">
            <img src="https://assets.codepen.io/605876/finder.png" alt="Finder">
            <img src="https://assets.codepen.io/605876/launch-control.png" alt="Launch Control">
            <img src="https://assets.codepen.io/605876/safari.png" alt="Safari">
            <img src="https://assets.codepen.io/605876/calendar.png" alt="Calendar">
            <img src="https://assets.codepen.io/605876/photos.png" alt="Photos">
            <img src="https://assets.codepen.io/605876/signal.png" alt="Signal">
            <img src="https://assets.codepen.io/605876/spotify.png" alt="Spotify">
            <img src="https://assets.codepen.io/605876/brave.png" alt="Brave">
            <img src="https://assets.codepen.io/605876/raycast.png" alt="Raycast">
            <img src="https://assets.codepen.io/605876/screenstudio.png" alt="Screen">
          </div>
        </div>
      </div>
      <lg-controls id="controls"></lg-controls>`;
  }

  private render() { this.root.innerHTML = this.html(); }

  private cache() {
    this.stage  = this.root.getElementById("stage") as HTMLElement;
    this.photo  = this.root.getElementById("heroPhoto") as HTMLImageElement;
    this.icons  = this.root.getElementById("icons") as HTMLElement;
    this.controls = this.root.getElementById("controls") as HTMLElement;
  }

  private seed() {
    // seed controls from attributes and defaults
    (this.controls as any).mode = (this.getAttribute("mode") as HeroMode) ?? "static";
    (this.controls as any).photos = DEFAULTS.photos;
    (this.controls as any).colors = {
      grid: this.stage.style.getPropertyValue("--grid"),
      a:    this.stage.style.getPropertyValue("--gradA"),
      b:    this.stage.style.getPropertyValue("--gradB"),
      c:    this.stage.style.getPropertyValue("--gradC"),
    };
  }

  private listen() {
    this.controls.addEventListener("modechange", (e: Event) => {
      this.setMode((e as CustomEvent).detail.mode as HeroMode);
    });
    this.controls.addEventListener("photochange", (e: Event) => {
      this.photo.src = (e as CustomEvent).detail.url as string;
    });
    this.controls.addEventListener("iconstoggle", (e: Event) => {
      const show = (e as CustomEvent).detail.show as boolean;
      const moving = this.stage.dataset.mode === "moving";
      this.icons.dataset.show = String(!moving && show);
    });
    this.controls.addEventListener("colorchange", (e: Event) => {
      const { grid, a, b, c } = (e as CustomEvent).detail as {grid:string;a:string;b:string;c:string};
      this.stage.style.setProperty("--grid",  grid);
      this.stage.style.setProperty("--gradA", a);
      this.stage.style.setProperty("--gradB", b);
      this.stage.style.setProperty("--gradC", c);
    });
  }

  private setMode(mode: HeroMode) {
    this.stage.dataset.mode = mode;
    const moving = mode === "moving";
    (this.stage.querySelector(".grad") as HTMLElement).hidden = !moving;
    (this.stage.querySelector(".grid") as HTMLElement).hidden = !moving;
    this.photo.hidden = moving;
    // keep icons off in moving mode regardless of control toggle
    const showIcons = this.icons.dataset.show === "true";
    this.icons.dataset.show = String(!moving && showIcons);
  }
}

if (!customElements.get("glass-hero")) {
  customElements.define("glass-hero", GlassHero);
}
