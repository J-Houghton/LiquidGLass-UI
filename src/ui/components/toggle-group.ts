export class ToggleGroup extends HTMLElement {
  static get observedAttributes() { return ["value"]; }
  private _value: string | null = null;

  constructor() {
    super();
    this.addEventListener("click", this.onClick);
    if (!this.getAttribute("role")) this.setAttribute("role", "group");
  }

  connectedCallback() { this.syncFromDOM(); }
  attributeChangedCallback(n: string) { if (n === "value") this.applyPressed(); }

  get value() { return this._value; }
  set value(v: string | null) {
    if (v === this._value) return;
    this._value = v;
    if (v == null) this.removeAttribute("value"); else this.setAttribute("value", v);
    this.applyPressed();
  }

  private onClick = (e: Event) => {
    const btn = (e.target as HTMLElement)?.closest("button");
    if (!btn) return;
    const v = (btn as HTMLButtonElement).dataset.value ?? btn.textContent?.trim() ?? "";
    this.value = v;
    this.dispatchEvent(new CustomEvent("change", { detail: { value: v }, bubbles: true }));
  };

  private syncFromDOM() {
    const pressed = this.querySelector('[aria-pressed="true"]') as HTMLButtonElement | null;
    this._value = pressed?.dataset.value ?? null;
    this.applyPressed();
  }

  private applyPressed() {
    this.querySelectorAll("button").forEach(b => {
      const on = (b as HTMLButtonElement).dataset.value === this._value;
      b.setAttribute("aria-pressed", String(on));
    });
  }
}

if (!customElements.get("toggle-group")) {
  customElements.define("toggle-group", ToggleGroup);
}
