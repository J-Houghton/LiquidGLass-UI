export function buildBezelMaskImage(
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  dpr?: number
): ImageData {
    const DPR = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);
    const W=Math.round(objectWidth*DPR), H=Math.round(objectHeight*DPR);
    const img=new ImageData(W,H);

    new Uint32Array(img.data.buffer).fill(0);

    const R=Math.round(radius*DPR), B=Math.max(1,Math.round(bezelWidth*DPR));
    const flatW=W-2*R, flatH=H-2*R, R2=R*R, Rplus1_2=(R+DPR)*(R+DPR), RminusB_2=(R-B)*(R-B);

    for(let y1=0;y1<H;y1++){
        for(let x1=0;x1<W;x1++){
            const idx=(y1*W + x1) * 4;
            const onLeft=x1<R, onRight=x1>=W-R, onTop=y1<R, onBot=y1>=H-R;
            const x=onLeft?x1-R:onRight?x1-R-flatW:0, y=onTop?y1-R:onBot?y1-R-flatH:0;
            
            const d2=x*x + y*y, inBezel=d2<=Rplus1_2 && d2>=RminusB_2; 
            if(!inBezel) continue;
            
            const op=d2<R2 ? 1
                : 1 - (Math.sqrt(d2) - Math.sqrt(R2)) / (Math.sqrt(Rplus1_2)-Math.sqrt(R2));
            img.data[idx+3]=Math.floor(255*op); // alpha only
        }
    } return img;
}  