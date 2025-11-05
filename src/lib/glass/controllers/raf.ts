import type { ReactiveController, ReactiveControllerHost } from 'lit';

export class RafController implements ReactiveController {
  private handle = 0;
  private cb: () => void;

  constructor(host: ReactiveControllerHost, onFrame: () => void) {
    this.cb = onFrame;
    host.addController(this);
  }
  hostConnected() { this.loop(); }                    // starts automatically
  hostDisconnected() { cancelAnimationFrame(this.handle); }

  private loop = () => {
    this.cb();
    this.handle = requestAnimationFrame(this.loop);
  };
}
