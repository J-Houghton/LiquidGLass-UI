/* ===== Debug helpers (optional overlays) ===== */ 
export function drawArrowsFromRG(
    imageData: ImageData,
    opts: {
        /** Desired visual spacing of glyphs in *output* pixels. @default 18 */
        step?: number;
        /** Visual length of a glyph (in *source* pixels) when magnitude is 1.0. @default 12 */
        scalePx?: number;
        /** * Multiplier for stroke thickness. 1 = constant, >1 = thicker for stronger mag. 
         * @default 1.5 
         */
        thicknessGain?: number;
        /** Type of glyph. @default 'triangle' */
        mode?: 'arrow' | 'triangle' | 'dash' | 'dot';
        /** Global alpha. @default 0.9 */
        alpha?: number;
        /** Whether to color glyphs by magnitude (blue to red). @default true */
        colorize?: boolean;
        /** Optional circular mask radius in *output* pixels. */
        radiusPx?: number;
        /** Nonlinear compression on magnitude. <1 = gentler growth. @default 0.75 */
        magGamma?: number;
        /** Clamp on visual glyph length in *source* pixels. */
        maxLengthPx?: number;
        /** The destination canvas or context to draw to. */
        out: HTMLCanvasElement | CanvasRenderingContext2D;
    }
) {
    const { width: W, height: H, data } = imageData;

    // --- Get Options ---
    let destCtx: CanvasRenderingContext2D | null;
    let destW: number, destH: number;

    if (opts.out instanceof HTMLCanvasElement) {
        destCtx = opts.out.getContext('2d');
        destW = opts.out.width;
        destH = opts.out.height;
    } else {
        destCtx = opts.out;
        destW = destCtx.canvas.width;
        destH = destCtx.canvas.height;
    }
    
    if (!destCtx) {
        throw new Error('Could not get 2D context from opts.out');
    }

    const stepVis = opts.step ?? 18;
    const scalePx = opts.scalePx ?? 12;
    const thicknessGain = opts.thicknessGain ?? 1.5;
    const mode = opts.mode ?? 'triangle';
    const alpha = Math.max(0, Math.min(1, opts.alpha ?? 0.9));
    const colorize = opts.colorize ?? true;
    const maskRadius = opts.radiusPx;
    const magGamma = opts.magGamma ?? 0.75;
    const maxLengthPx = opts.maxLengthPx ?? 24;

    // --- Setup ---
    // Create an offscreen canvas matching the *source* ImageData resolution
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) throw new Error('2D context not available for offscreen canvas');

    // Convert desired visual step to a step in SOURCE pixels
    const step = Math.max(8, Math.round(stepVis * (W / destW)));

    g.clearRect(0, 0, W, H);
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Base line width scaled to source resolution
    const baseLineWidth = Math.max(1, 0.8 * (W / 512));

    const neutralTol = 1; // treat [127..129] as neutral
    
    // Masking setup
    const cx = W * 0.5, cy = H * 0.5;
    const useMask = typeof maskRadius === 'number' && isFinite(maskRadius);
    // Scale mask radius from destination pixels to source pixels
    const maskR_source = useMask ? maskRadius! * (W / destW) : 0;
    const maskR2 = useMask ? (maskR_source * maskR_source) : 0;

    // --- HSL Color Function ---
    const setColor = (m: number) => {
        if (!colorize) {
            g.strokeStyle = '#0af';
            g.fillStyle = '#0af';
            return;
        }
        const hue = 220 - 220 * Math.min(1, m); // 220 (blue) -> 0 (red)
        const css = `hsl(${hue} 90% 55%)`;
        g.strokeStyle = css;
        g.fillStyle = css;
    };

    // --- Main Loop ---
    for (let y = (step >> 1); y < H; y += step) {
        for (let x = (step >> 1); x < W; x += step) {

            if (useMask) {
                const dxm = x - cx, dym = y - cy;
                if ((dxm * dxm + dym * dym) > maskR2) continue;
            }

            const idx = (y * W + x) * 4;
            const r = data[idx + 0], gch = data[idx + 1], b = data[idx + 2];

            // Skip neutral pixels (R=128, G=128, B=0)
            if (Math.abs(r - 128) <= neutralTol && Math.abs(gch - 128) <= neutralTol && b === 0) {
                continue;
            }

            // Decode vector and magnitude
            const dx = (r - 128) / 127; // Decoded displacement X
            const dy = (gch - 128) / 127; // Decoded displacement Y
            const mag = Math.hypot(dx, dy); // [0, ~1.414]

            if (mag < 1e-3) continue;

            const ang = Math.atan2(dy, dx);
            const udx = dx / mag; // Unit direction X
            const udy = dy / mag; // Unit direction Y

            // Apply compression and clamp visual length in SOURCE pixels
            const m = Math.pow(Math.min(1, mag), magGamma);
            const L = Math.min(maxLengthPx, scalePx * m);

            setColor(mag);
            // Set thickness based on magnitude
            g.lineWidth = baseLineWidth * (1 + (thicknessGain - 1) * mag); 
            // --- Draw Glyphs ---

            if (mode === 'dash') {
                const hx = 0.5 * L * udx; // half-length x
                const hy = 0.5 * L * udy; // half-length y
                g.beginPath();
                g.moveTo(x - hx, y - hy);
                g.lineTo(x + hx, y + hy);
                g.stroke();
                continue;
            }

            if (mode === 'dot') {
                const rr = Math.max(1, 0.25 * L); // Scale dot size with L
                g.beginPath();
                g.arc(x, y, rr, 0, Math.PI * 2);
                g.fill();
                continue;
            }

            if (mode === 'triangle') {
                const wTri = Math.max(2, 0.6 * L); // Width of triangle base
                g.save();
                g.translate(x, y);
                g.rotate(ang);
                g.beginPath();
                g.moveTo(L, 0);             // Tip
                g.lineTo(0, 0.5 * wTri);    // Base corner
                g.lineTo(0, -0.5 * wTri);   // Base corner
                g.closePath();
                g.fill();
                g.restore();
                continue;
            }

            if (mode === 'arrow') {
                const tx = x + udx * L; // Tip x
                const ty = y + udy * L; // Tip y
                g.beginPath();
                g.moveTo(x, y);
                g.lineTo(tx, ty);
                g.stroke();

                // Draw filled arrowhead
                const ah = Math.max(3, 0.3 * L); // Arrow head size
                const a1 = ang + 2.7, a2 = ang - 2.7; // ~155 deg
                g.beginPath();
                g.moveTo(tx, ty);
                g.lineTo(tx - Math.cos(a1) * ah, ty - Math.sin(a1) * ah);
                g.lineTo(tx - Math.cos(a2) * ah, ty - Math.sin(a2) * ah);
                g.closePath();
                g.fill();
                continue;
            }
        }
    }

    // Blit the offscreen canvas to the destination
    destCtx.clearRect(0, 0, destW, destH);
    destCtx.drawImage(cv, 0, 0, destW, destH);
    
    // Return the offscreen canvas (as in the original function)
    return cv;
}


export function drawSurfacePlot(fn: (x: number) => number, bezelPx: number, glassPx: number) {
    const W = 300, H = 120, pad = 8
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d')
    if (!g) throw new Error('2D context not available');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(pad, H - pad); g.lineTo(W - pad, H - pad); g.stroke()
    g.beginPath(); g.moveTo(pad, H - pad); g.lineTo(pad, pad); g.stroke()
    g.strokeStyle = '#7cf'; g.beginPath()
    for (let i = 0; i <= W - 2 * pad; i++) {
        const t = i / (W - 2 * pad), y = fn(t)
        const X = pad + i, Y = H - pad - y * (H - 2 * pad)
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y)
    }
    g.stroke()
       
    const bezelFrac = Math.min(1, Math.max(0, bezelPx / Math.max(1, bezelPx + glassPx)))
    const bezelW = (W - 2 * pad) * bezelFrac
    g.fillStyle = 'rgba(255,120,0,0.3)'   // orange tint for bezel
    g.fillRect(pad, pad, bezelW, H - 2 * pad)

    // Draw glass area in another color
    g.fillStyle = 'rgba(0,200,255,0.25)'  // cyan tint for glass
    g.fillRect(pad + bezelW, pad, (W - 2 * pad) - bezelW, H - 2 * pad)

    // Label overlay
    g.fillStyle = '#fff'; g.globalAlpha = 0.8; g.font = '12px system-ui'
    g.fillText(`bezel ${Math.round(bezelPx)}px · glass ${Math.round(glassPx)}px`, pad + 6, pad + 14)
    return c
}
