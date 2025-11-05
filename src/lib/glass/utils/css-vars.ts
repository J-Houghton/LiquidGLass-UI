export function applyCssVars(
  host: HTMLElement,
  v: { width: number; height: number; radius: number; },
  state: { frost: number; saturation: number; refractiveIndex: number; debug: boolean; },
  cache: { width: number; height: number; radius: number; frost: number; sat: number; F0: number; }
) {
  const F0 = ((state.refractiveIndex - 1) / (state.refractiveIndex + 1)) ** 2;
  const set = (k: string, val: string | number, key: keyof typeof cache) => {
    const num = typeof val === 'number' ? val : Number.NaN;
    if (!Number.isNaN(num) && cache[key] === num) return;
    if (!Number.isNaN(num)) cache[key] = num;
    host.style.setProperty(k, String(val));
  };
  set('--width', `${v.width}px`, 'width');
  set('--height', `${v.height}px`, 'height');
  set('--radius', v.radius, 'radius');
  set('--frost', state.frost, 'frost');
  set('--saturation', state.saturation, 'sat');
  set('--F0', F0, 'F0');
 

  const dbg = String(!!state.debug);
  if (document.documentElement.dataset.debug !== dbg) {
    document.documentElement.dataset.debug = dbg;
  }
}
