/* ===== Specular Lighting (angle in degrees) ===== */
export const toRad = (d: number) => d * Math.PI / 180;

// Builds a grayscale highlight inside the bezel band.
// Bright where bezel normal aligns with (cosθ, sinθ). Alpha scaled by strength.
export function buildSpecularImage(
  objectWidth: number, objectHeight: number,
  radius: number, bezelWidth: number,
  angleDeg: number, strength: number = 1, dpr?: number
): ImageData {
    const DPR = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);

    const W=Math.round(objectWidth*DPR), H=Math.round(objectHeight*DPR);
    const img = new ImageData(W,H);

    const R=Math.round(radius*DPR), B=Math.max(1,Math.round(bezelWidth*DPR));
    const flatW=W-2*R, flatH=H-2*R, R2=R*R, Rplus1_2=(R+DPR)*(R+DPR), RminusB_2=(R-B)*(R-B);

    const vx=Math.cos(toRad(angleDeg)), vy=Math.sin(toRad(angleDeg));
    // clear
    new Uint32Array(img.data.buffer).fill(0);

    for (let y1=0;y1<H;y1++){
        for (let x1=0;x1<W;x1++){
            const idx=(y1*W + x1) * 4;
            const onLeft=x1<R, onRight=x1>=W-R, onTop=y1<R, onBot=y1>=H-R;
            const x=onLeft?x1-R:onRight?x1-R-flatW:0, y=onTop?y1-R:onBot?y1-R-flatH:0;

            const d2=x*x + y*y, inBezel=d2<=Rplus1_2 && d2>=RminusB_2; 
            if(!inBezel) continue;

            const dist=Math.max(1e-6,Math.sqrt(d2));
            const op=d2<R2 ? 1 
                : 1 - (Math.sqrt(d2) - Math.sqrt(R2)) / (Math.sqrt(Rplus1_2)-Math.sqrt(R2));
                
            // outward unit normal on arc; flip Y so up is positive
            const nx = x/dist, ny = -y/dist;
            // cosine alignment [0..1], 0 at outer rim → 1 at inner edge
            const align=Math.abs(nx*vx + ny*vy), inner=(R - dist)/B, rim=Math.sqrt(Math.max(0, inner)); 

            const coeff=Math.max(0, Math.min(1, align*rim));
            const c = Math.floor(255*coeff), a=Math.floor(255*coeff*op*Math.max(0,Math.min(1,strength)));

            img.data[idx+0]=c; 
            img.data[idx+1]=c; 
            img.data[idx+2]=c; 
            img.data[idx+3]=a;
        }
    }
    return img;
}