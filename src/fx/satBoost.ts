export function driveSaturation(state: { specularSaturation: number }) {
    const el = document.getElementById('satBoost') as SVGFEColorMatrixElement | null;
    if (!el) return;
    el.setAttribute('values', String(1 + state.specularSaturation));
}
  