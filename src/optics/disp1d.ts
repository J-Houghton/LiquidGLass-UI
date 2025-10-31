/* ===== 1D displacement along bezel cross-section ===== */
// Returns lateral distance per sample along bezel, using a vertical incident ray model.
export function calculateDisplacementMap(
    glassThickness: number = 200,
    bezelWidth: number = 50,
    bezelHeightFn: (x: number) => number = (x) => x,
    refractiveIndex: number = 1.5,
    samples: number = 128
): number[] {
    const eta = 1 / refractiveIndex;

    function refract(nx: number, ny: number): [number, number] | null { 
        const dot=ny; 
        const k = 1 - eta*eta*(1 - dot*dot); 
        if (k < 0) return null;
        const r = Math.sqrt(k); 
        return [-(eta*dot + r)*nx, eta - (eta*dot + r)*ny]; 
    }

    const out = new Array(samples);

    for (let i=0;i<samples;i++){
      const x = i / samples, y = bezelHeightFn(x);
      const dx = x < 1 ? 1e-4 : -1e-4, y2 = bezelHeightFn(x + dx);

      const dydx=(y2 - y) / dx, mag=Math.sqrt(dydx*dydx + 1);
      const nx=-dydx/mag, ny=-1/mag;

      const rvec = refract(nx, ny); 
      if (!rvec){ out[i]=0; continue; }
      const remaining = y * bezelWidth + glassThickness;
      out[i] = rvec[0] * (remaining / rvec[1]);
    }
    return out;
} 