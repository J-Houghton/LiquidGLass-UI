/* ===== 2D RG vector field pack ===== */
// Packs unit vectors to R/G with 128 bias. Normalization by maximumDisplacement. 
export function calculateDisplacementMap2(
    canvasWidth: number, canvasHeight: number,
    radius: number, bezelWidth: number, 
    maximumDisplacement: number, 
    precomputedDisplacementMap: number[] = [], 
    dpr?: number
): ImageData {
    const DPR = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);
    
    // Buffer size in physical pixels
    const W = Math.round(canvasWidth*DPR), H = Math.round(canvasHeight*DPR);
    const imageData = new ImageData(W, H);
    
    // Fill neutral RG (128,128), A=255
    new Uint32Array(imageData.data.buffer).fill(0xff008080);
    
    // Object (effect) covers the whole buffer
    const OW=W, OH=H, R=Math.round(radius*DPR), B=Math.max(1, Math.round(bezelWidth*DPR));
    // Flat spans between corner arcs
    const flatW = OW - 2*R, flatH = OH - 2*R;
    const R2 = R*R, Rplus1_2=(R+1)*(R+1), RminusB_2=(R-B)*(R-B);
    
    for (let y1=0;y1<OH;y1++){
      for (let x1=0;x1<OW;x1++){
        const idx = (y1*W + x1) * 4;
        // Signed coords inside each rounded corner, else 0 on flats
        const onLeft = x1 < R, onRight = x1 >= OW - R, onTop = y1 < R, onBot = y1 >= OH - R;

        const x = onLeft ? x1 - R : onRight ? x1 - R - flatW : 0;
        const y = onTop  ? y1 - R : onBot   ? y1 - R - flatH : 0;
        const d2 = x*x + y*y;

        const inBezel = d2 <= Rplus1_2 && d2 >= RminusB_2;
        if (!inBezel) continue;
        
        // Feather the outer edge by ~1px to avoid a hard ring
        const op = d2 < R2 ? 1 : 1 - (Math.sqrt(d2) - Math.sqrt(R2)) / (Math.sqrt(Rplus1_2) - Math.sqrt(R2)); 
        // Distance from circle center of the corner
        const dist = Math.max(1e-6, Math.sqrt(d2));
        const distFromSide = R - dist;
        // Sample the 1D cross-section by radial position within the bezel band
        const i = Math.max(0, Math.min(precomputedDisplacementMap.length - 1, ((distFromSide / B) * precomputedDisplacementMap.length) | 0));
        const disp = precomputedDisplacementMap[i] || 0;

        // Unit direction from center; lateral vector = -∇H → here as -cos/sin sign
        const cos = x / dist, sin = y / dist;
        const dX = (-cos * disp) / maximumDisplacement;
        const dY = (-sin * disp) / maximumDisplacement;

        imageData.data[idx+0] = 128 + dX * 127 * op;    // R channel = X
        imageData.data[idx+1] = 128 + dY * 127 * op;    // G channel = Y
        imageData.data[idx+2] = 0;                      // B unused
        imageData.data[idx+3] = 255;                    // A
      }
    }
    return imageData;
}  