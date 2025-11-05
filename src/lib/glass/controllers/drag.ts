import type {ReactiveController, ReactiveControllerHost} from 'lit';

export type DragOpts = {
  handle?: HTMLElement | ShadowRoot | Document; // default: host.shadowRoot || host
  clampToViewport?: boolean; // limit to page size (viewport)
  onStart?: () => void;
  onMove?: (x: number, y: number) => void;
  onEnd?: () => void;
};

export class DragController implements ReactiveController {
  private host: ReactiveControllerHost & HTMLElement;
  private opts: DragOpts;

  private pdown = (e: PointerEvent) => this.onDown(e);
  private pmove = (e: PointerEvent) => this.onMove(e);
  private pup   = (e: PointerEvent) => this.onUp(e);

  // NEW: track logical position instead of parsing CSS transform
  private posX = 0; // CHANGED
  private posY = 0; // CHANGED

  // Drag session state
  private dragging = false;
  private startX = 0;
  private startY = 0;

  // NEW: capture the element's rect at drag start, *before* applying new movement.
  private startRect?: { left: number; top: number; width: number; height: number }; // CHANGED

  constructor(host: ReactiveControllerHost & HTMLElement, opts: DragOpts = {}) {
    this.host = host;
    this.opts = { clampToViewport: true, ...opts }; // CHANGED: default to viewport clamp
    host.addController(this);
  }

  hostConnected() {
    const handle = (this.opts.handle ?? (this.host.shadowRoot ?? this.host)) as any;
    handle.addEventListener('pointerdown', this.pdown, { passive: false });
    // Prevent native panning/zooming during drag
    (this.host.style as any).touchAction = 'none';
    // Ensure positioning context for fixed translate
    if (getComputedStyle(this.host).position === 'static') this.host.style.position = 'fixed';
    // Initialize transform from internal state
    this.applyTransform();
  }

  hostDisconnected() {
    const handle = (this.opts.handle ?? (this.host.shadowRoot ?? this.host)) as any;
    handle.removeEventListener('pointerdown', this.pdown);
    window.removeEventListener('pointermove', this.pmove);
    window.removeEventListener('pointerup', this.pup);
  }

  // NEW: public setter if you ever need to programmatically move
  setPosition(x: number, y: number) { // CHANGED
    this.posX = x | 0;
    this.posY = y | 0;
    this.applyTransform();
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();

    // CHANGED: capture pointer on the host if possible
    if (this.host instanceof Element) this.host.setPointerCapture?.(e.pointerId);

    this.dragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;

    // CHANGED: snapshot the rect at drag start and subtract current logical offset
    const r = this.host.getBoundingClientRect();
    this.startRect = {
      left: r.left - this.posX,
      top:  r.top  - this.posY,
      width: r.width,
      height: r.height,
    };

    this.opts.onStart?.();
    window.addEventListener('pointermove', this.pmove, { passive: false });
    window.addEventListener('pointerup', this.pup, { passive: true });
  }

  private onMove(e: PointerEvent) {
    if (!this.dragging) return;
    e.preventDefault();

    // CHANGED: compute deltas relative to drag start
    let x = this.posX + (e.clientX - this.startX);
    let y = this.posY + (e.clientY - this.startY);

    if (this.opts.clampToViewport) {
      // CHANGED: clamp using the startRect, not the live rect
      const s = this.startRect!;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Keep element fully inside viewport. Compute allowed x/y so that
      // (left0 + x) in [0, vw - width], (top0 + y) in [0, vh - height]
      const minX = -s.left;
      const maxX = vw - (s.left + s.width);
      const minY = -s.top;
      const maxY = vh - (s.top + s.height);

      if (x < minX) x = minX;
      else if (x > maxX) x = maxX;

      if (y < minY) y = minY;
      else if (y > maxY) y = maxY;
    }

    // Apply visually without committing to state yet
    this.host.style.transform = `translate3d(${x}px, ${y}px, 0)`; // unchanged API
    this.opts.onMove?.(x, y);
  }

  private onUp(_e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;

    // CHANGED: commit final transform to internal logical state
    const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/i.exec(this.host.style.transform || '');
    if (m) {
      this.posX = +m[1];
      this.posY = +m[2];
    }

    this.startRect = undefined; // CHANGED
    this.opts.onEnd?.();
    window.removeEventListener('pointermove', this.pmove);
    window.removeEventListener('pointerup', this.pup);
  }

  private applyTransform() {
    // Ensure a concrete transform string
    this.host.style.transform = `translate3d(${this.posX}px, ${this.posY}px, 0)`; // CHANGED
  }
}