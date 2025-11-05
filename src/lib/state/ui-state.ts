import {createContext} from '@lit/context';
import type { SurfaceKind } from '../glass/optics/surfaces.js';

export type UIState = {
  width: number; height: number; radius: number;
  frost: number; saturation: number;
  debug: boolean;

  surface: SurfaceKind;
  refractiveIndex: number; 
  glassThickness: number;
  bezelWidth: number; 
  scale_px: number; 
  
  blurStdDev: number; blurKind: 'gauss'|'noise1'|'noise2';

  showSpecular: boolean; specularAngleDeg: number; specularStrength: number;

  dispersion: number;
  r: number; g: number; b: number; 
};

type Listener = () => void;

export class UIStateStore {
  private _value: UIState;
  private subs = new Set<Listener>();
  constructor(init: UIState) { this._value = init; }
  get value() { return this._value; }
  update(patch: Partial<UIState>) {
    this._value = {...this._value, ...patch};
    this.subs.forEach(f => f());
  }
  subscribe(fn: Listener) { this.subs.add(fn); return () => this.subs.delete(fn); }
}
 
export const uiStateCtx = createContext<UIStateStore>('ui-state');  
