import Pickr from '@simonwep/pickr';

export type HeroMode = "static" | "moving";
type ColorSet = { grid?: string; a?: string; b?: string; c?: string };

export class LGControls extends HTMLElement {
  private root: ShadowRoot;

  private state = {
    mode: "static" as HeroMode,
    photos: [] as string[],
    grid: "#1f2937",
    a: "#2b2bff",
    b: "#00d4ff",
    c: "#00ffa3",
    showIcons: false,
  };

private prGrid?: any; private prA?: any; private prB?: any; private prC?: any;
private toggle = (p?: any) => { if (!p) return; p.isOpen() ? p.hide() : p.show(); }; 

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });   // back to shadow
  }

  connectedCallback() {
    this.render();
    this.bind();
    this.renderThumbs();
    this.initPickers();
  }

  set mode(m: HeroMode) { this.state.mode = m; this.syncMode(); }
  get mode(): HeroMode { return this.state.mode; }
  set photos(list: string[]) { this.state.photos = list; this.renderThumbs(); }
  set colors(v: ColorSet) {
    if (v.grid) this.state.grid = v.grid;
    if (v.a) this.state.a = v.a;
    if (v.b) this.state.b = v.b;
    if (v.c) this.state.c = v.c;
    this.emitColors();
  }
  set showIcons(v: boolean) {
    this.state.showIcons = v;
    const cb = this.root.getElementById("toggleIcons") as HTMLInputElement | null;
    if (cb) cb.checked = v;
  }

  private html() {
    return /*html*/`
      <!-- Theme must exist inside the shadow so the swatch renders -->
      <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/nano.min.css">
      <style>
        :host { display:block }
        .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; padding-top:6px }
        .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap }
        .hint { color: var(--muted, color-mix(in oklch, CanvasText, transparent 40%)) }
        .thumbs { display:flex; gap:8px }
        .thumbs button { width:54px; height:54px; border-radius:12px; border:2px solid transparent; padding:0; overflow:hidden; cursor:pointer; background:transparent }
        .thumbs button[aria-pressed="true"]{ border-color: var(--ring, #60a5fa) }
        .thumbs img { width:100%; height:100%; object-fit:cover; display:block }
        .chip { padding:.45rem .75rem; border-radius:999px; border:1px solid color-mix(in oklch, CanvasText, transparent 80%); background: color-mix(in oklch, CanvasText, transparent 92%); cursor:pointer }
        .chip[aria-pressed="true"]{ border-color: color-mix(in oklch, CanvasText, transparent 65%) }
        .toggle { display:inline-flex; align-items:center; gap:.5rem; color: var(--muted) }
        .color {
    display:inline-flex;
    align-items:center;
    gap:6px;
    padding:.35rem .5rem;
    border:1px solid color-mix(in oklch, CanvasText, transparent 85%);
    border-radius:999px;
    background: transparent;
  }
  #movingControls[hidden], #staticControls[hidden]{ display:none !important }
      </style>
      <div class="controls">
        <div class="row" aria-label="Background mode">
          <span class="hint">Background:</span>
          <toggle-group id="modeGroup" class="seg">
            <button class="chip" data-value="static" aria-pressed="true">Static</button>
            <button class="chip" data-value="moving" aria-pressed="false">Moving</button>
          </toggle-group>
        </div>

        <div class="row" id="staticControls">
          <div class="thumbs" id="thumbs" role="group" aria-label="Choose photo"></div>
          <label class="toggle" title="Show app icons over static photo">
            <input id="toggleIcons" type="checkbox"> Show app icons
          </label>
        </div>

        <div class="row" id="movingControls" hidden>
          <span class="hint">Colors:</span>
          <div class="color">Grid <span id="pickr-grid" role="button" tabindex="0" aria-label="Pick grid color"></span></div>
          <div class="color">A <span id="pickr-a"></span></div>
          <div class="color">B <span id="pickr-b"></span></div>
          <div class="color">C <span id="pickr-c"></span></div>
        </div>
      </div>`;
  }

  private render() { this.root.innerHTML = this.html(); }

  private bind() {
    const modeGroup = this.root.getElementById("modeGroup")!;
    modeGroup.addEventListener("change", (e: Event) => {
      const value = (e as CustomEvent).detail?.value as HeroMode;
      this.state.mode = value;
      this.syncMode();
      this.dispatchEvent(new CustomEvent("modechange", { detail: { mode: value } }));
    });

    this.root.getElementById("toggleIcons")!
      .addEventListener("change", (e: Event) => {
        const show = (e.target as HTMLInputElement).checked;
        this.state.showIcons = show;
        this.dispatchEvent(new CustomEvent("iconstoggle", { detail: { show } }));
      });

    this.root.getElementById("thumbs")!
      .addEventListener("click", (e: Event) => {
        const btn = (e.target as HTMLElement).closest("button");
        if (!btn) return;
        this.root.querySelectorAll("#thumbs button[aria-pressed]")
          .forEach(b => b.setAttribute("aria-pressed", "false"));
        (btn as HTMLButtonElement).setAttribute("aria-pressed", "true");
        this.dispatchEvent(new CustomEvent("photochange", { detail: { url: (btn as HTMLButtonElement).dataset.photo! } }));
      });

    // OPEN/CLOSE pickers on swatch click – NEW
    this.root.getElementById("pickr-grid")?.addEventListener("click", () => this.toggle(this.prGrid));
    this.root.getElementById("pickr-a")?.addEventListener("click", () => this.toggle(this.prA));
    this.root.getElementById("pickr-b")?.addEventListener("click", () => this.toggle(this.prB));
    this.root.getElementById("pickr-c")?.addEventListener("click", () => this.toggle(this.prC));
  }

  private renderThumbs() {
    const t = this.root.getElementById("thumbs")!;
    t.innerHTML = this.state.photos.map((url, i) =>
      `<button aria-pressed="${i===0}" data-photo="${url}"><img src="${url}" alt="Scenery ${i+1}"></button>`
    ).join("");
  }

  private syncMode() {
    const moving = this.state.mode === "moving";
    this.root.getElementById("staticControls")!.toggleAttribute("hidden", moving);
    this.root.getElementById("movingControls")!.toggleAttribute("hidden", !moving);
    const group = this.root.getElementById("modeGroup") as any;
    if (group) group.value = this.state.mode;
    if (!moving) {
      [this.prGrid, this.prA, this.prB, this.prC].forEach(p => p?.hide?.());
    }
  }

  private hex(p: any, fallback: string) {
    const c = p?.getSelectedColor?.() || p?.getColor?.();
    return c ? c.toHEXA().toString() : fallback;
  }

  private emitColors = () => {
    this.dispatchEvent(new CustomEvent("colorchange", {
      detail: {
        grid: this.hex(this.prGrid, this.state.grid),
        a: this.hex(this.prA, this.state.a),
        b: this.hex(this.prB, this.state.b),
        c: this.hex(this.prC, this.state.c),
      }
    }));
  };

  private initPickers() { 

    const mk = (elId: string, def: string) => {
      const el = this.root.getElementById(elId) as HTMLElement | null;
      if (!el) return null;

      return Pickr.create({
          el,                  
  theme: "nano",
  default: def,  
  components: {
    preview: true, opacity: true, hue: true,
    interaction: { input: true, save: true, clear: false }
        }
      });
    };

    this.prGrid = mk("pickr-grid", this.state.grid);
    this.prA    = mk("pickr-a",    this.state.a);
    this.prB    = mk("pickr-b",    this.state.b);
    this.prC    = mk("pickr-c",    this.state.c);

    [this.prGrid, this.prA, this.prB, this.prC]
      .filter(Boolean)
      .forEach((p: any) => p.on("init", this.emitColors)
                            .on("save", this.emitColors)
                            .on("change", this.emitColors));
                  
  }
  
disconnectedCallback() {
  [this.prGrid, this.prA, this.prB, this.prC].forEach(p => p?.destroyAndRemove?.());
}
}
if (!customElements.get("lg-controls")) {
  customElements.define("lg-controls", LGControls);
}
