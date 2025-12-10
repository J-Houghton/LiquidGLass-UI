/*
 * Displacement map computation utilities.
 *
 * These functions are ported from the original Lit based project into a
 * framework agnostic form.  They implement the optical refraction model
 * that generates a per‑pixel offset for an SVG displacement filter.  The
 * one‑dimensional profile is computed using Snell's law across a curved
 * bezel, and the two‑dimensional map packs those offsets into RG
 * channels with a neutral bias.
 */
/**
 * Compute a one‑dimensional refraction displacement profile across the bezel.
 * Each sample in the returned array represents the horizontal distance a
 * vertically incident light ray travels through the glass material before
 * exiting the opposite surface.
 *
 * The function models Snell's law at the curved bezel interface: given a
 * surface profile function (`bezelHeightFn`) describing the shape of the
 * outer surface from 0 to 1, the routine calculates the surface normal at
 * each sample, refracts a vertical incident ray into the glass using the
 * provided refractive index, then projects the refracted direction over the
 * remaining optical path length (`bezelWidth` + `glassThickness`).
 *
 * A soft knee limiter is applied to avoid extreme displacements near grazing
 * angles.  This curve is later normalized and packed into a 2D displacement
 * map.
 *
 * @param glassThickness  Effective thickness of the interior glass region in px
 * @param bezelWidth      Width of the bezel band in px
 * @param bezelHeightFn   Parametric function describing bezel shape on [0,1]
 * @param refractiveIndex Index of refraction (IOR) for the glass
 * @param samples         Number of discrete samples across the bezel
 */
export function calculateDisplacementCurve(glassThickness = 200, bezelWidth = 50, bezelHeightFn = (x) => x, refractiveIndex = 1.5, samples = 128) {
    // ratio of indices for Snell's law when going from air into glass
    const eta = 1 / refractiveIndex;
    /**
     * Refract the incident vector (0, -1) against a surface normal (nx, ny).
     * Returns the refracted vector or null when total internal reflection would
     * occur.  See original implementation for details.
     */
    function refract(nx, ny) {
        const dot = ny; // incident vector is (0, -1) so dot = -1 * ny
        const k = 1 - eta * eta * (1 - dot * dot);
        if (k < 0)
            return null;
        const r = Math.sqrt(k);
        // Compute the refracted vector using the closed form of Snell's law.
        return [-(eta * dot + r) * nx, eta - (eta * dot + r) * ny];
    }
    const out = new Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = i / samples;
        const y = bezelHeightFn(x);
        // Estimate derivative via a small forward difference.  For x == 1 use a
        // backward difference to avoid sampling outside [0,1].
        const dx = x < 1 ? 1e-4 : -1e-4;
        const y2 = bezelHeightFn(x + dx);
        const dydx = (y2 - y) / dx;
        const mag = Math.sqrt(dydx * dydx + 1);
        // Outward surface normal; pointing from glass into air.
        const nx = -dydx / mag;
        const ny = -1 / mag;
        const rvec = refract(nx, ny);
        if (!rvec) {
            out[i] = 0;
            continue;
        }
        const remaining = y * bezelWidth + glassThickness;
        // Guard against near-grazing refraction where rvec[1] approaches zero.
        const denom = Math.sign(rvec[1]) * Math.max(1e-3, Math.abs(rvec[1]));
        const rawDisp = rvec[0] * (remaining / denom);
        // Soft‑knee limiter: avoid runaway peaks while keeping a linear feel.  The
        // knee is set to the overall optical path length.
        const knee = Math.max(1, glassThickness + bezelWidth);
        out[i] = rawDisp / (1 + Math.abs(rawDisp) / knee);
    }
    return out;
}
/**
 * Construct a two‑dimensional displacement map for refraction inside a
 * rounded rectangle.  Each pixel in the returned object stores a unit
 * displacement vector pointing opposite the outward normal of the bezel band
 * (packed into the red and green channels with a 128 bias and 127 scale),
 * and a magnitude proportional to a precomputed 1D displacement curve.
 *
 * Pixels outside the bezel band are left unchanged.  The `maximumDisplacement`
 * parameter normalizes the precomputed values so that the map fits within
 * the 8‑bit colour range.
 *
 * @param canvasWidth                 Width of the effect in CSS pixels
 * @param canvasHeight                Height of the effect in CSS pixels
 * @param radius                      Corner radius of the rounded rectangle
 * @param bezelWidth                  Width of the outer bezel band in pixels
 * @param maximumDisplacement         Maximum absolute displacement from the 1D map
 * @param precomputedDisplacementMap  Array of scalar displacements indexed by relative position [0..1] across the bezel
 * @param dpr                         Optional device pixel ratio override; defaults to 1 when not provided
 */
export function calculateDisplacementMap2(canvasWidth, canvasHeight, radius, bezelWidth, maximumDisplacement, precomputedDisplacementMap = [], dpr = 1) {
    const DPR = dpr;
    const W = Math.round(canvasWidth * DPR);
    const H = Math.round(canvasHeight * DPR);
    const data = new Uint8ClampedArray(W * H * 4);
    // Initialize all pixels to a neutral offset: R=128, G=128, B=0, A=255.
    for (let i = 0; i < W * H; i++) {
        const idx = i * 4;
        data[idx + 0] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
    }
    const R = Math.round(radius * DPR);
    const B = Math.max(1, Math.round(bezelWidth * DPR));
    const Rin = Math.max(0, R - B);
    const W2 = Math.max(0, W - 2 * B);
    const H2 = Math.max(0, H - 2 * B);
    /** Determine whether a point (x,y) lies within a rounded rectangle of
     * width w, height h and corner radius r. */
    const inRR = (x, y, w, h, r) => {
        const onL = x < r;
        const onR = x >= w - r;
        const onT = y < r;
        const onB = y >= h - r;
        if ((onL || onR) && (onT || onB)) {
            const flatW = w - 2 * r;
            const flatH = h - 2 * r;
            const cx = onL ? x - r : x - r - flatW;
            const cy = onT ? y - r : y - r - flatH;
            return (cx * cx + cy * cy) <= r * r + 1e-6;
        }
        return x >= 0 && x < w && y >= 0 && y < h;
    };
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = (y * W + x) * 4;
            // Skip pixels outside the outer rounded rect.
            if (!inRR(x, y, W, H, R))
                continue;
            // Skip pixels inside the inner rounded rect (i.e. outside the bezel band).
            if (W2 > 0 && H2 > 0 && inRR(x - B, y - B, W2, H2, Rin))
                continue;
            // Compute distance into the band and the outward normal.
            let nx = 0;
            let ny = 0;
            let t = 0;
            const onL = x < R;
            const onR = x >= W - R;
            const onT = y < R;
            const onB = y >= H - R;
            if ((onL || onR) && (onT || onB)) {
                const flatW = W - 2 * R;
                const flatH = H - 2 * R;
                const cx = onL ? x - R : x - R - flatW;
                const cy = onT ? y - R : y - R - flatH;
                const dist = Math.max(1e-6, Math.hypot(cx, cy));
                nx = cx / dist;
                ny = cy / dist;
                t = R - dist; // distance from the rim: 0 at the outer edge → B at the inner edge
            }
            else {
                // Flats: choose the nearest edge.
                const dL = x;
                const dR = W - 1 - x;
                const dT = y;
                const dB = H - 1 - y;
                const m = Math.min(dL, dR, dT, dB);
                if (m === dT) {
                    nx = 0;
                    ny = -1;
                    t = dT;
                }
                else if (m === dB) {
                    nx = 0;
                    ny = +1;
                    t = dB;
                }
                else if (m === dL) {
                    nx = -1;
                    ny = 0;
                    t = dL;
                }
                else {
                    nx = +1;
                    ny = 0;
                    t = dR;
                }
            }
            // Normalize t into [0..1] across the bezel width.  This selects a
            // displacement value from the precomputed 1D curve.
            const u = Math.max(0, Math.min(1, t / B));
            const f = u * (precomputedDisplacementMap.length - 1);
            const i0 = Math.max(0, Math.floor(f));
            const i1 = Math.min(precomputedDisplacementMap.length - 1, i0 + 1);
            const w1 = f - i0;
            const w0 = 1 - w1;
            const disp = (precomputedDisplacementMap[i0] ?? 0) * w0 + (precomputedDisplacementMap[i1] ?? 0) * w1;
            // Outward normal → negative direction for inward refraction feel.
            const dX = (-nx * disp) / maximumDisplacement;
            const dY = (-ny * disp) / maximumDisplacement;
            // Pack into [0,255] with neutral offset of 128 and scale of 127.
            data[idx + 0] = 128 + dX * 127;
            data[idx + 1] = 128 + dY * 127;
            data[idx + 2] = 0;
            data[idx + 3] = 255;
        }
    }
    return { width: W, height: H, data };
}
